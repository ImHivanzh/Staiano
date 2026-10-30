import { readFile, writeFile } from "node:fs/promises";
import { NtExecutable, NtExecutableResource, Data, Resource } from "resedit";

const RESOURCE_DIRECTORY = 2;
const RT_RCDATA = 10;
const resourceBytes = (exe) =>
  exe.getSectionByEntry(RESOURCE_DIRECTORY)?.info.virtualSize ?? 0;

/** Edit the temporary Node copy before SEA injection; never modify the system runtime. */
export async function executableIcon(exePath, iconPath) {
  const exe = NtExecutable.from(await readFile(exePath), { ignoreCert: true });
  const originalBytes = resourceBytes(exe);
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
  // Con icone più piccole .rsrc si accorcia e resedit sposta .reloc a un indirizzo più basso:
  // postject (LIEF) allora segnala «Relocation corrupted». Riempire .rsrc ne mantiene la posizione.
  const shortfall = originalBytes - resourceBytes(exe);
  if (shortfall > 0) {
    resources.entries.push({
      type: RT_RCDATA,
      id: 1,
      lang: 1033,
      codepage: 1252,
      bin: new ArrayBuffer(shortfall),
    });
    resources.outputResource(exe);
  }
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
