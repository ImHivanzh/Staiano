"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./ArLink.module.css";

type Link = { urls: string[]; expiresAt: number; qr: string };

/** Link AR per iPad/telefono: valido 30 minuti, solo rete locale, QR sul PC. */
export function ArLink({
  label,
  variants,
}: {
  label: string;
  variants: { label: string; url: string }[];
}) {
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!link) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [link]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ label, variants }] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setLink({
        urls: body.urls,
        expiresAt: body.expiresAt,
        qr: await QRCode.toDataURL(body.urls[0], { margin: 1, width: 240 }),
      });
      setNow(Date.now());
    } catch (reason) {
      setLink(null);
      setError(
        reason instanceof Error ? reason.message : "Link AR non creato.",
      );
    } finally {
      setBusy(false);
    }
  }
  const seconds = link
    ? Math.max(0, Math.round((link.expiresAt - now) / 1000))
    : 0;

  return (
    <div className={styles.ar}>
      <button
        type="button"
        className="bottone"
        disabled={busy}
        onClick={create}
      >
        {link ? "Nuovo link AR" : "Realtà aumentata su iPad/telefono"}
      </button>
      {error && <p role="alert">{error}</p>}
      {link &&
        (seconds ? (
          <div role="status">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={link.qr}
              alt="QR code del link AR"
              width={240}
              height={240}
            />
            <input
              readOnly
              aria-label="Link AR"
              value={link.urls[0]}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="bottone tenue"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(link.urls[0])
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false))
              }
            >
              {copied ? "Copiato" : "Copia link"}
            </button>
            <p className="nota">
              Valido ancora {Math.floor(seconds / 60)}:
              {String(seconds % 60).padStart(2, "0")} · funziona solo sulla
              stessa rete Wi-Fi, senza accedere. Inquadra il QR con iPad o
              telefono.
            </p>
            {link.urls.length > 1 && (
              <p className="nota">
                Se non si apre, prova: {link.urls.slice(1).join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <p role="status">Link scaduto: creane uno nuovo.</p>
        ))}
    </div>
  );
}
