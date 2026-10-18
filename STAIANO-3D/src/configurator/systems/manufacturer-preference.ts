export function lastAvailableManufacturer(
  previous: readonly (string | undefined)[],
  available: readonly string[],
) {
  return (
    previous.findLast((brand) => brand && available.includes(brand)) ??
    available[0]
  );
}
