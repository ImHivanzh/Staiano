import type { Project } from "@/schemas/project";
import {
  area,
  distance,
  pointInPolygon,
  selfIntersects,
} from "./geometry/primitives";
import { overlappingPolygons } from "./geometry/rooms";
import { roomWallSpan } from "./geometry/placement";
import { radiatorProducts } from "./catalogs/radiators";
import { elementOutputAtDeltaT, radiatorWidth } from "./radiators/size";
export type Check = {
  code: string;
  status: "valid" | "warning" | "invalid";
  message: string;
  entityId?: string;
};
export function validateProject(p: Project): Check[] {
  const checks: Check[] = [];
  for (const f of p.floors)
    checks.push({
      code: "scale",
      status: f.scaleVerified ? "valid" : "invalid",
      message: `${f.name}: scala ${f.scaleVerified ? "verificata" : "da calibrare"}`,
      entityId: f.id,
    });
  const badWalls = p.walls.filter(
    (w) => distance(w.start, w.end) < 0.05 || w.thickness <= 0,
  );
  checks.push({
    code: "walls",
    status: badWalls.length ? "invalid" : "valid",
    message: badWalls.length
      ? `${badWalls.length} muri non validi`
      : `${p.walls.length} muri validi`,
  });
  const used = new Set(p.rooms.flatMap((r) => r.wallIds));
  const open = p.walls.filter((w) => !used.has(w.id));
  if (open.length)
    checks.push({
      code: "closure",
      status: "warning",
      message: `${open.length} muri senza stanza chiusa. Verificare contorni e intersezioni.`,
    });
  if (!p.rooms.length)
    checks.push({
      code: "rooms",
      status: "warning",
      message:
        "Nessuna stanza chiusa. Disegnare un contorno o creare un rettangolo.",
    });
  for (const r of p.rooms) {
    const valid =
      area(r.polygon) > 0 && !selfIntersects(r.polygon) && r.heightM > 0;
    checks.push({
      code: "geometry",
      status: valid ? "valid" : "invalid",
      message: `${r.name || "Senza nome"}: geometria ${valid ? "valida" : "non valida"}`,
      entityId: r.id,
    });
    checks.push({
      code: "thermal",
      status:
        valid && Math.abs(r.designLoadW - r.netAreaM2 * r.heightM * 35) < 1e-5
          ? "valid"
          : "invalid",
      message: `${r.name}: fabbisogno convenzionale`,
      entityId: r.id,
    });
    if (!r.name.trim())
      checks.push({
        code: "name",
        status: "warning",
        message: "Stanza senza nome",
        entityId: r.id,
      });
    const radiators = p.radiators.filter((d) => d.roomId === r.id);
    if (r.systemType === "radiator") {
      const outputW = radiators.reduce((sum, d) => sum + d.outputW, 0);
      checks.push({
        code: "power",
        status: outputW >= r.designLoadW ? "valid" : "invalid",
        message: `${r.name}: radiatori ${Math.round(outputW)} W / richiesti ${Math.round(r.designLoadW)} W`,
        entityId: r.id,
      });
    }
  }
  let overlap = 0;
  for (let i = 0; i < p.rooms.length; i++)
    for (let j = i + 1; j < p.rooms.length; j++)
      if (
        p.rooms[i].floorId === p.rooms[j].floorId &&
        overlappingPolygons(p.rooms[i].polygon, p.rooms[j].polygon)
      )
        overlap++;
  checks.push({
    code: "overlap",
    status: overlap ? "invalid" : "valid",
    message: overlap
      ? `${overlap} sovrapposizioni tra stanze`
      : "Nessuna sovrapposizione tra stanze",
  });
  for (const d of [
    ...p.radiators,
    ...p.airTerminals,
    ...p.hvacSystems.flatMap((s) => s.indoorUnits),
  ]) {
    const room = p.rooms.find((r) => r.id === d.roomId);
    checks.push({
      code: "placement",
      status:
        room && pointInPolygon(d.position, room.polygon) ? "valid" : "invalid",
      message: `${d.productId}: posizione in stanza`,
      entityId: d.id,
    });
    const wall = p.walls.find((w) => w.id === d.wallId);
    if (wall)
      checks.push({
        code: "dimensions",
        status:
          room && d.widthMm / 1000 <= (roomWallSpan(room, wall)?.lengthM ?? 0)
            ? "valid"
            : "invalid",
        message: `${d.productId}: ingombro su parete`,
        entityId: d.id,
      });
  }
  for (const r of p.radiators) {
    const product = radiatorProducts.find((v) => v.id === r.productId);
    let expected: number | null = null;
    if (product)
      try {
        expected = elementOutputAtDeltaT(product, r.deltaTK) * r.elements;
      } catch {
        /* Unavailable data stays unverified. */
      }
    checks.push({
      code: "catalog",
      status:
        product && product.commercialElementCounts.includes(r.elements)
          ? "valid"
          : "invalid",
      message: `${r.productId}: configurazione a catalogo`,
      entityId: r.id,
    });
    checks.push({
      code: "output",
      status:
        expected !== null && Math.abs(expected - r.outputW) < 1e-5
          ? "valid"
          : "invalid",
      message: `${r.productId}: resa da formula produttore`,
      entityId: r.id,
    });
    checks.push({
      code: "deltaT",
      status:
        r.deltaTK === p.projectSettings.radiatorDeltaTK ? "valid" : "invalid",
      message: `${r.productId}: ΔT progetto ${p.projectSettings.radiatorDeltaTK} K`,
      entityId: r.id,
    });
    checks.push({
      code: "productDimensions",
      status:
        product &&
        Math.abs(r.widthMm - radiatorWidth(product, r.elements)) < 1e-5 &&
        r.heightMm === product.heightMm &&
        r.depthMm === product.depthMm
          ? "valid"
          : "invalid",
      message: `${r.productId}: dimensioni originali`,
      entityId: r.id,
    });
  }
  for (const t of p.airTerminals)
    checks.push({
      code: "noise",
      status:
        t.noiseDbA === null
          ? "warning"
          : t.noiseDbA <= 37
            ? "valid"
            : "invalid",
      message: `${t.productId}: ${t.noiseDbA === null ? "rumore non disponibile" : `${t.noiseDbA} dB(A)`}`,
      entityId: t.id,
    });
  return checks;
}
