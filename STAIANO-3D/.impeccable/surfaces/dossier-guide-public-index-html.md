---
version: 1
slug: "dossier-guide-public-index-html"
primary_target: "dossier-guide/public/index.html"
related_targets: ["dossier-guide/public/guide.css","dossier-guide/public/guide.js","src/services/pdf/dossier-guide.ts","src/services/pdf/render.ts"]
---

Mode: Read. Code-led extension of the Staiano visual system. User confirmed that the guide must include project-specific content. Public guidance and encrypted project snapshot. User additionally requires encryption with decryption in the Cloudflare Worker, a visible full Staiano brand and modern design.

THESIS: Keep a concise reading companion next to the PDF, beginning with the recipient's own project.
OWN-WORLD: Inherit Inter, Staiano blue, navy text, white and cool paper surfaces; preserve the real logo. No invented commercial claims.
STORY: Scan the cover; recognize title and totals; understand sections, codes and control outcomes; return to the PDF and discuss unresolved choices with the installer.
FIRST VIEWPORT: Original logo beside the visible STAIANO wordmark and "Guida al dossier" in a restrained masthead. One short editorial heading and introduction, followed by the project snapshot with name, export date, four measurements, room names, device counts and check counts. Below, a two-column reading guide becomes one column on phones.
FORM: Precisely specified narrow Read surface in the established world; no new visual-world roll. Signature behavior is opening the encrypted QR through a Worker-only private key (AES-256-GCM with RSA-OAEP wrapping), with explicit fallback to general guidance on malformed links. Seed: not applicable; precisely specified narrow extension of the established world, exempt from a concept round.
FINISH: Verify desktop 1440px and phone 390px, project and general states, invalid fragment, overflow, only encrypted project data in requests; finish with the shipped reviewer and documenter.

Scope: dossier-guide/public, dossier-guide/worker.ts, src/services/pdf/dossier-guide.ts, first-page QR in src/services/pdf/render.ts. No attachments, complete project files, user identifiers or drawings in the QR. Totals reflect the export snapshot, not live updates. Truncated room list explicitly refers to the complete PDF.

Delivered: public guide at https://staiano-dossier.ivanbuonocore7.workers.dev/. Each export generates a fresh AES-256-GCM key and nonce; RSA-OAEP/SHA-256 wraps the AES key, and only the Worker's secret private key decrypts it. The URL fragment carries the encrypted envelope. General guidance remains available without a valid snapshot. The compact Read layout retains local Inter, original symbol, visible wordmark, navy text and pale Staiano surfaces.

Finish evidence: `.impeccable/review/guide/desktop.png`, `mobile.png`, `mobile-privacy.png` and `privacy-detail.png`. The finish review disposition is ship at the requested fix scope. No new generated raster or identity was introduced.

