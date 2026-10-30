const MB = 1024 * 1024;

export class PayloadTooLargeError extends Error {}

/** Blocca prima dell'invio un corpo che il server rifiuterebbe: il messaggio dice quanto manca. */
export function assertPayloadSize(
  text: string,
  maxBytes: number,
  what: string,
): string {
  const size = new TextEncoder().encode(text).byteLength;
  if (size > maxBytes)
    throw new PayloadTooLargeError(
      `${what} è troppo grande: ${(size / MB).toFixed(1).replace(".", ",")} MB, il limite è ${Math.round(maxBytes / MB)} MB. Elimina sfondi o immagini non necessari, oppure dividi il progetto.`,
    );
  return text;
}
