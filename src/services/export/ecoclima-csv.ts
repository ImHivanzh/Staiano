import type { EcoclimaBom } from "@/domain/air-terminals/commercial-bom";

function cell(value: string | number) {
  let text = String(value);
  if (typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/u.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
const euros = (cents: number | null, missing: string) =>
  cents === null ? missing : (cents / 100).toFixed(2).replace(".", ",");

export function ecoclimaBomCsv(bill: EcoclimaBom): string {
  const rows: (string | number)[][] = [
    [
      "Codice",
      "Articolo",
      "Quantità",
      "Prezzo unitario di listino EUR",
      "Importo di listino EUR",
      "Stato",
      "Note",
      "Revisione listino",
      "IVA",
    ],
    ...bill.lines.map((line) => [
      line.sku ?? "Da verificare",
      line.label,
      line.quantity === null
        ? "Da verificare"
        : String(line.quantity).replace(".", ","),
      euros(line.unitPriceCents, "Da quotare"),
      euros(line.extendedPriceCents, "Da completare"),
      line.status === "known" ? "Prezzo disponibile" : "Da completare",
      line.reason ?? "",
      bill.revision ?? "Non indicata",
      "Da confermare sulla fonte",
    ]),
  ];
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n"
  );
}
