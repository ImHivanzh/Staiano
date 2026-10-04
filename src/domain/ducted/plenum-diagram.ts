import type { SupplyPlenum } from "./plenum";

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
const short = (value: string, max = 21) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
const number = (value: number, digits = 1) =>
  value.toLocaleString("it-IT", {
    maximumFractionDigits: digits,
  });

/** Ports share one scale (px/mm). Machine/body/routes are an unquoted diagram. */
export function plenumDiagramSvg(result: SupplyPlenum): string {
  const count = result.branches.length;
  const columns = Math.min(3, Math.max(1, count));
  const cellWidth = 160;
  const width = Math.max(360, columns * cellWidth + 32);
  const rows = Math.ceil(count / columns);
  const height = 166 + Math.max(1, rows) * 146;
  const largest = Math.max(
    63,
    ...result.branches.map((branch) => branch.diameterMm ?? 0),
  );
  const pxPerMm = 66 / largest;
  const description =
    `Schema del plenum di mandata ${result.systemName}. ${count} stacchi. ` +
      result.groupedDiameters
        .map(
          (group) =>
            `${group.quantity} di diametro ${group.diameterMm} millimetri`,
        )
        .join(", ") +
      result.machineGeometry?.bodyWidthMm !==
      null && result.machineGeometry?.bodyWidthMm !== undefined
      ? `. Corpo proposto ${result.machineGeometry.bodyWidthMm} x ${result.machineGeometry.bodyHeightMm} x ${result.machineGeometry.totalDepthMm} mm sulla connessione macchina documentata; perdite di carico e percorsi da verificare.`
      : ". Specificare l'attacco della macchina. Corpo e raccordo non vengono inventati.";
  const branchNodes = result.branches
    .map((branch, index) => {
      const row = Math.floor(index / columns),
        column = index % columns;
      const x = width / 2 + (column - (columns - 1) / 2) * cellWidth;
      const y = 184 + row * 146;
      const radius =
        branch.diameterMm === null ? 14 : (branch.diameterMm * pxPerMm) / 2;
      const colour = branch.verified ? "#0088aa" : "#a37b35";
      return `<g data-port-id="${escapeXml(branch.id)}" data-diameter-mm="${branch.diameterMm ?? "pending"}">
      <title>${escapeXml(`${branch.roomName}, mandata ${(branch.pointIndex ?? 0) + 1}, ${branch.airflowM3h} m³/h, ${branch.diameterMm === null ? "diametro da verificare" : `Ø ${branch.diameterMm} mm`}`)}</title>
      <path d="M ${x} ${y - 47} V ${y - radius - 7}" fill="none" stroke="${colour}" stroke-width="2" marker-end="url(#flow)"/>
      <circle cx="${x}" cy="${y}" r="${radius}" fill="#fff" stroke="${colour}" stroke-width="2" ${branch.verified ? "" : 'stroke-dasharray="4 3"'}/>
      <text x="${x}" y="${y + 4}" fill="${colour}" font-size="11" font-weight="600" text-anchor="middle">${index + 1}</text>
      <text x="${x}" y="${y + 48}" fill="#173642" font-size="13" font-weight="600" text-anchor="middle">${branch.diameterMm === null ? "Ø da verificare" : `Ø ${branch.diameterMm} mm`}</text>
      <text x="${x}" y="${y + 66}" fill="#526b75" font-size="11" text-anchor="middle">${number(branch.airflowM3h)} m³/h${branch.velocityMs === null ? "" : ` · ${number(branch.velocityMs, 2)} m/s`}</text>
      <text x="${x}" y="${y + 83}" fill="#526b75" font-size="11" text-anchor="middle">${escapeXml(short(branch.roomName))} · M${branch.pointIndex === null ? "?" : branch.pointIndex + 1}</text>
    </g>`;
    })
    .join("\n");
  const rowHeaders = Array.from({ length: rows }, (_, row) => {
    const countInRow = Math.min(columns, count - row * columns);
    const firstX = width / 2 - ((columns - 1) / 2) * cellWidth;
    const lastX = width - 25;
    const y = 137 + row * 146;
    return countInRow
      ? `<path d="M ${firstX} ${y} H ${lastX}" stroke="#0088aa" stroke-width="2" fill="none"/>`
      : "";
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
    <title id="title">Plenum di mandata · ${escapeXml(result.systemName)}</title>
    <desc id="description">${escapeXml(description)}</desc>
    <defs><marker id="flow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M 0 0 L 5 2.5 L 0 5 Z" fill="#0088aa"/></marker></defs>
    <rect width="${width}" height="${height}" rx="8" fill="#f5f9fa"/>
    <g font-family="Arial, sans-serif">
      <text x="16" y="22" fill="#173642" font-size="13" font-weight="600">Mandata · ${count} stacchi</text>
      <rect x="16" y="44" width="106" height="50" rx="5" fill="#e2ecf0" stroke="#a5bcc5"/>
      <text x="69" y="64" fill="#173642" font-size="11" text-anchor="middle">Macchina</text>
      <text x="69" y="81" fill="#526b75" font-size="10" text-anchor="middle">${result.machineAirflowM3h === null ? "Da configurare" : `${number(result.machineAirflowM3h)} m³/h`}</text>
      <path d="M 125 69 H 150" stroke="#0088aa" stroke-width="2" marker-end="url(#flow)"/>
      <rect x="155" y="44" width="${width - 171}" height="50" rx="5" fill="#e4f3f6" stroke="#0088aa"/>
      <text x="${155 + (width - 171) / 2}" y="64" fill="#007e9e" font-size="12" font-weight="600" text-anchor="middle">PLENUM</text>
      <text x="${155 + (width - 171) / 2}" y="81" fill="#526b75" font-size="10" text-anchor="middle">${result.machineGeometry?.bodyWidthMm ? `${result.machineGeometry.bodyWidthMm}×${result.machineGeometry.bodyHeightMm}×${result.machineGeometry.totalDepthMm} mm` : "Attacco macchina da specificare"}</text>
      ${count ? `<path d="M ${width - 25} 94 V ${137 + Math.max(0, rows - 1) * 146}" stroke="#0088aa" stroke-width="2" fill="none"/>` : ""}
      ${rowHeaders}
      ${branchNodes}
      ${count === 0 ? `<text x="${width / 2}" y="180" fill="#806739" font-size="12" text-anchor="middle">Inserire le bocchette di mandata</text>` : ""}
      <text x="16" y="${height - 28}" fill="#657b83" font-size="10">Cerchi proporzionali ai diametri nominali. Schema indicativo.</text>
      <text x="16" y="${height - 13}" fill="#657b83" font-size="10">Quote di progetto: verificare flangia, fabbricazione e percorsi.</text>
    </g>
  </svg>`;
}
