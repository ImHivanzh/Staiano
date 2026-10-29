import * as THREE from "three";
import {
  TRAPEZOIDAL_PLENUM_MM,
  trapezoidalPlenumPath,
} from "@/domain/air-terminals/trapezoidal-plenum";
import { plenumFaceGeometry } from "./plenum-shell";

const SHEET_M = 0.0015;

export type TrapezoidalHole = { x: number; radius: number };
export type TrapezoidalPlenumPiece = {
  geometry: THREE.BufferGeometry;
  /** "sheet" ha l'esterno nel materiale 0, "cap" è la testata di lamiera. */
  kind: "sheet" | "cap";
};

/**
 * Corpo del plenum trapezoidale, in metri, con X lungo il diffusore, Y in alto
 * e Z verso la stanza. A soffitto la bocca guarda in basso e lo scalino è
 * davanti; a parete la bocca guarda la stanza, la faccia larga è dietro e lo
 * scalino sta in basso (la parete piana in alto).
 * Le lamiere crescono verso l'interno: l'ingombro resta il profilo del disegno.
 */
export function trapezoidalPlenumPieces(
  lengthM: number,
  mounting: "ceiling" | "wall",
  endHoles: readonly TrapezoidalHole[],
  backHoles: readonly TrapezoidalHole[],
  neckMm?: number,
): TrapezoidalPlenumPiece[] {
  const { wideMm, heightMm } = TRAPEZOIDAL_PLENUM_MM;
  const ceiling = mounting === "ceiling";
  const depth = (ceiling ? wideMm : heightMm) / 1000;
  const height = (ceiling ? heightMm : wideMm) / 1000;
  const point = ([u, v]: [number, number]) =>
    ceiling
      ? new THREE.Vector2(height / 2 - v / 1000, -depth / 2 + u / 1000)
      : new THREE.Vector2(height / 2 - u / 1000, -depth / 2 + v / 1000);
  // Vector2(y, z): coordinate della sezione nel piano YZ del plenum.
  const path = trapezoidalPlenumPath(neckMm).map(point);
  const centre = path
    .reduce((sum, p) => sum.add(p), new THREE.Vector2())
    .divideScalar(path.length);
  const pieces: TrapezoidalPlenumPiece[] = [];
  path.slice(0, -1).forEach((from, index) => {
    const to = path[index + 1];
    const along = to.clone().sub(from);
    const size = along.length();
    along.normalize();
    // Il segmento 3 è la faccia larga con gli stacchi, il 4 la parete piana.
    const holes = index === 3 ? endHoles : index === 4 ? backHoles : [];
    const geometry = plenumFaceGeometry(
      lengthM,
      size,
      holes.map(({ x, radius }) => ({ x, y: 0, radius })),
    );
    let ex = new THREE.Vector3(1, 0, 0);
    const ey = new THREE.Vector3(0, along.x, along.y);
    let ez = new THREE.Vector3().crossVectors(ex, ey);
    const middle = from.clone().add(to).multiplyScalar(0.5);
    if (ez.y * (middle.x - centre.x) + ez.z * (middle.y - centre.y) < 0) {
      ex = ex.negate();
      ez = ez.negate();
    }
    geometry.applyMatrix4(
      new THREE.Matrix4()
        .makeBasis(ex, ey, ez)
        .setPosition(0, middle.x, middle.y),
    );
    pieces.push({ geometry, kind: "sheet" });
  });
  // Testate: sagoma del profilo, spessa quanto la lamiera, ai due estremi.
  const outline = new THREE.Shape(path.map((p) => new THREE.Vector2(-p.y, p.x)));
  for (const end of [-1, 1]) {
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: SHEET_M,
      bevelEnabled: false,
    });
    geometry.applyMatrix4(
      new THREE.Matrix4()
        .makeBasis(
          new THREE.Vector3(0, 0, -1),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(1, 0, 0),
        )
        .setPosition(end < 0 ? -lengthM / 2 : lengthM / 2 - SHEET_M, 0, 0),
    );
    pieces.push({ geometry, kind: "cap" });
  }
  return pieces;
}
