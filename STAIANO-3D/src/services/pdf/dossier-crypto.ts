export const encode64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export const decode64 = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );

/** Each dossier gets an independent AES key; only the Worker's private RSA key can unwrap it. */
export async function encryptDossier(
  bytes: Uint8Array<ArrayBuffer>,
  publicSpki: string,
) {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    decode64(publicSpki),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    bytes,
  );
  const wrapped = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    await crypto.subtle.exportKey("raw", key),
  );
  return `1.${encode64(new Uint8Array(wrapped))}.${encode64(iv)}.${encode64(new Uint8Array(encrypted))}`;
}
