/**
 * Plenum trapezoidale isolato EPI-EDL-FB per i diffusori lineari EDLS-FB / EDLH-FB.
 * Quote dai disegni Ecoclima FMD.00097677 (L 2000, stacchi superiori) e
 * FMD.00097674 (L 1200, stacchi posteriori); sono le stesse di
 * scripts/blender/edl-trapezoidal-plenum.py.
 */
export const TRAPEZOIDAL_PLENUM_FAMILIES: readonly string[] = ["EDLS", "EDLH"];

export const TRAPEZOIDAL_PLENUM_MM = {
  /** Larghezza della parte alta (la parete piana è il lato opposto allo scalino). */
  wideMm: 149,
  /** Larghezza del collo, sopra la bocca del diffusore. */
  neckMm: 75,
  heightMm: 240,
  /** Tratto verticale sotto la faccia superiore, poi lo scalino inclinato fino a slantEndMm. */
  straightTopMm: 50,
  slantEndMm: 141,
  collarDiameterMm: 145,
  collarHeightMm: 80,
  /** Le testate di chiusura distano 15 mm dall'estremità: L2 = L - 30. */
  capMm: 15,
} as const;

export function isTrapezoidalPlenumFamily(family: string) {
  return TRAPEZOIDAL_PLENUM_FAMILIES.includes(family);
}

/**
 * Il disegno è dell'EPI-EDL-FB (collo 75, P 240, Ø145); l'EPI-EDL-FA ha la stessa
 * serie P 240 con collo 65 (stessa parte alta, collo ridotto: assunzione).
 * Le misure con P 300 (collo 105-165, Ø198) non hanno disegno e restano scatole.
 */
export function usesTrapezoidalDrawing(
  family: string,
  spec: { widthMm: number | null; heightMm: number | null },
) {
  return (
    isTrapezoidalPlenumFamily(family) &&
    (spec.widthMm === TRAPEZOIDAL_PLENUM_MM.neckMm || spec.widthMm === 65) &&
    spec.heightMm === TRAPEZOIDAL_PLENUM_MM.heightMm
  );
}

/**
 * La bocca del plenum ha la larghezza della bocchetta a cui si attacca
 * (non la misura di tabella); resta sempre più stretta della parte alta.
 */
export function trapezoidalNeckMm(grilleWidthMm: number) {
  return Math.min(Math.max(grilleWidthMm, 20), TRAPEZOIDAL_PLENUM_MM.wideMm - 10);
}

/**
 * Contorno aperto della lamiera in mm: u dalla parete piana, v dalla faccia
 * superiore verso la bocca. Parte dal bordo del collo e gira intorno al corpo.
 */
export function trapezoidalPlenumPath(
  neckMm: number = TRAPEZOIDAL_PLENUM_MM.neckMm,
): [number, number][] {
  const { wideMm, heightMm, straightTopMm, slantEndMm } = TRAPEZOIDAL_PLENUM_MM;
  return [
    [neckMm, heightMm],
    [neckMm, slantEndMm],
    [wideMm, straightTopMm],
    [wideMm, 0],
    [0, 0],
    [0, heightMm],
  ];
}
