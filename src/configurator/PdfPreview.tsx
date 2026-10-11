"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function PdfPreview({ blob }: { blob: Blob }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(800);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/workers/pdf.worker.min.mjs";
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const pdf = await task.promise;
        if (!cancelled) setDocument(pdf);
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Anteprima PDF non disponibile.",
          );
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width - 24)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    const node = canvas.current;
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    void (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(width / original.width, 2),
        });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        node.width = Math.ceil(viewport.width * pixelRatio);
        node.height = Math.ceil(viewport.height * pixelRatio);
        node.style.width = `${viewport.width}px`;
        node.style.height = `${viewport.height}px`;
        task = page.render({
          canvas: node,
          viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Pagina PDF non disponibile.",
          );
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, width]);
  return (
    <section className="lettore-pdf" aria-label="Documento PDF generato">
      <div className="azioni pagine-pdf">
        <button
          className="bottone piccolo"
          disabled={!document || pageNumber === 1}
          onClick={() => {
            setRendered(false);
            setPageNumber((page) => page - 1);
          }}
        >
          Pagina precedente
        </button>
        <span role="status">
          {document
            ? `Pagina ${pageNumber} di ${document.numPages}`
            : "Caricamento PDF…"}
        </span>
        <button
          className="bottone piccolo"
          disabled={!document || pageNumber === document.numPages}
          onClick={() => {
            setRendered(false);
            setPageNumber((page) => page + 1);
          }}
        >
          Pagina successiva
        </button>
      </div>
      {error && (
        <p role="alert" className="errore">
          {error}
        </p>
      )}
      <div ref={container} className="pagina-pdf">
        <canvas
          ref={canvas}
          data-testid="pdf-preview-page"
          data-rendered={rendered}
          aria-label={`Pagina ${pageNumber} del dossier PDF`}
        />
      </div>
    </section>
  );
}
