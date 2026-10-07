export async function boundedForm(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  )
    throw new Error("invalid form");
  const declared = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared > 4096 || !request.body)
    throw new Error("invalid form");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new Error("invalid form");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
