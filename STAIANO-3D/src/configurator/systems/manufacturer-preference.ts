export function lastAvailableManufacturer(
  previous: readonly (string | undefined)[],
  available: readonly string[],
  fallback?: string,
) {
  const remembered = previous.findLast(
    (brand) => brand && available.includes(brand),
  );
  if (remembered) return remembered;
  return fallback && available.includes(fallback) ? fallback : available[0];
}
