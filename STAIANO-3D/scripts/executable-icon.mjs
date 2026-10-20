import { readFile, writeFile } from "node:fs/promises";
import { NtExecutable, NtExecutableResource, Data, Resource } from "resedit";

/** Edit the temporary Node copy before SEA injection; never modify the system runtime. */
export async function executableIcon(exePath, iconPath) {
  const exe = NtExecutable.from(await readFile(exePath), { ignoreCert: true });
  const resources = NtExecutableResource.from(exe);
  const icon = Data.IconFile.from(await readFile(iconPath));
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const { id, lang } of groups.length ? groups : [{ id: 1, lang: 1033 }])
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      id,
      lang,
      icon.icons.map((item) => item.data),
    );
  resources.outputResource(exe);
  const result = Buffer.from(exe.generate());
  const checked = NtExecutableResource.from(NtExecutable.from(result));
  if (
    !Resource.IconGroupEntry.fromEntries(checked.entries).every(
      (group) => group.icons.length === icon.icons.length,
    )
  )
    throw Error("Risorse icona EXE non valide.");
  await writeFile(exePath, result);
}
