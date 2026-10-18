/** Validate archived revisions only when a saved project actually requests them. */
export function catalogHistory<T extends { version: string }>(
  current: readonly T[],
  archive: Record<string, unknown>,
  parse: (value: unknown) => T,
) {
  const versions = new Map(
    current.map((catalog) => [catalog.version, catalog]),
  );
  return (version: string): T | null => {
    const cached = versions.get(version);
    if (cached) return cached;
    if (!Object.hasOwn(archive, version)) return null;
    const catalog = parse(archive[version]);
    versions.set(version, catalog);
    return catalog;
  };
}
