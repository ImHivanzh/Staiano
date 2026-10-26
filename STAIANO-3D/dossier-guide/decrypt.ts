import { decode64 } from "../src/services/pdf/dossier-crypto";
import { z } from "zod";

const snapshotSchema = z.object({
  v: z.literal(1),
  n: z.string().max(120),
  d: z.iso.datetime(),
  k: z.enum(["complete", "summary"]),
  c: z.number().positive().optional(),
  m: z.array(z.number().finite().nonnegative()).length(10),
  r: z.array(z.string().max(50)).max(12),
});

export async function readLimited(
  stream: ReadableStream<Uint8Array>,
  limit: number,
) {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw Error("size");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function decryptDossier(envelope: string, privatePkcs8: string) {
  if (
    envelope.length > 3000 ||
    !/^1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(envelope)
  )
    throw Error("envelope");
  const [, wrapped, nonce, ciphertext] = envelope.split(".");
  const iv = decode64(nonce),
    wrappedKey = decode64(wrapped);
  if (iv.length !== 12 || wrappedKey.length !== 256) throw Error("size");
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    decode64(privatePkcs8),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const rawKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    wrappedKey,
  );
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "decrypt",
  ]);
  const compressed = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    decode64(ciphertext),
  );
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return snapshotSchema.parse(
    JSON.parse(new TextDecoder().decode(await readLimited(stream, 16000))),
  );
}
