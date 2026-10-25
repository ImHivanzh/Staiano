/** Keep the current EXE and its predecessor; source history is independent. */
export async function pruneExecutablePackages(request, currentCommit) {
  const packages = [];
  let page = "1";
  while (page) {
    const response = await request(
      `/packages?package_type=generic&per_page=100&order_by=created_at&sort=desc&page=${page}`,
    );
    if (!response.ok)
      throw new Error(`Elenco EXE GitLab: HTTP ${response.status}.`);
    packages.push(
      ...(await response.json()).filter(
        (p) =>
          p.name === "staiano-hvac" &&
          p.package_type === "generic" &&
          /^[a-f0-9]{40}$/.test(p.version) &&
          p.status === "default",
      ),
    );
    page = response.headers.get("x-next-page");
  }
  // A retry of an older publication must never remove a newer package.
  if (packages[0]?.version !== currentCommit) return 0;
  let removed = 0;
  for (const pkg of packages.slice(2)) {
    const response = await request(`/packages/${pkg.id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404)
      throw new Error(`Rimozione EXE ${pkg.version}: HTTP ${response.status}.`);
    removed++;
  }
  return removed;
}
