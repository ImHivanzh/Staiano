export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export function numberFromForm(value: FormDataEntryValue | null): number {
  return Number(String(value ?? "").replace(",", "."));
}
