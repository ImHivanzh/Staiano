import type { DetailPart } from "./device-detail";

export function roundCassetteGrille(
  widthMm: number,
  heightMm: number,
  depthMm: number,
): DetailPart[] {
  const w = widthMm / 1000,
    h = heightMm / 1000,
    d = depthMm / 1000;
  return Array.from({ length: 11 }, (_, i) => {
    const t = (i - 5) / 6;
    return {
      position: [0, -h / 2 - 0.0012, t * d * 0.25],
      scale: [w * 0.5 * Math.sqrt(1 - t * t), 0.0003, d * 0.006],
    };
  });
}

/** Four-way reconstruction; saved machine dimensions remain the placement envelope. */
export function cassetteDetail(
  widthMm: number,
  heightMm: number,
  depthMm: number,
) {
  const w = widthMm / 1000,
    h = heightMm / 1000,
    d = depthMm / 1000;
  // shortcut: the decorative panel is fitted to the saved envelope; add separate panel dimensions before modelling its OEM overhang.
  const panelHeight = Math.min(0.034, h / 4);
  const faceY = -h / 2 + 0.004;
  const outlets: DetailPart[] = [];
  const vanes: DetailPart[] = [];
  const frame: DetailPart[] = [];
  const panelY = -h / 2 + panelHeight / 2;
  for (const side of [-1, 1]) {
    frame.push(
      {
        position: [0, panelY, side * d * 0.4625],
        scale: [w, panelHeight, d * 0.075],
      },
      {
        position: [side * w * 0.4625, panelY, 0],
        scale: [w * 0.075, panelHeight, d * 0.85],
      },
      {
        position: [0, panelY, side * d * 0.3025],
        scale: [w * 0.69, panelHeight, d * 0.065],
      },
      {
        position: [side * w * 0.3025, panelY, 0],
        scale: [w * 0.065, panelHeight, d * 0.54],
      },
    );
    for (const across of [-1, 1])
      frame.push({
        position: [side * w * 0.38, panelY, across * d * 0.38],
        scale: [w * 0.13, panelHeight, d * 0.13],
      });
    outlets.push(
      {
        position: [0, faceY, side * d * 0.38],
        scale: [w * 0.72, 0.003, d * 0.09],
      },
      {
        position: [side * w * 0.38, faceY, 0],
        scale: [w * 0.09, 0.003, d * 0.72],
      },
    );
    vanes.push(
      {
        position: [0, faceY - 0.001, side * d * 0.38],
        scale: [w * 0.7, 0.003, d * 0.025],
      },
      {
        position: [side * w * 0.38, faceY - 0.001, 0],
        scale: [w * 0.025, 0.003, d * 0.7],
      },
    );
  }
  return {
    body: {
      position: [0, panelHeight / 2, 0],
      scale: [w * 0.91, h - panelHeight, d * 0.91],
    } as DetailPart,
    intake: {
      position: [0, faceY, 0],
      scale: [w * 0.54, 0.003, d * 0.54],
    } as DetailPart,
    grille: Array.from({ length: 12 }, (_, i): DetailPart => ({
      position: [0, faceY - 0.001, ((i + 0.5) / 12 - 0.5) * d * 0.52],
      scale: [w * 0.52, 0.003, d * 0.012],
    })),
    frame,
    outlets,
    vanes,
  };
}
