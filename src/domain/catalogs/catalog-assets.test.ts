import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { airTerminalCatalog } from "./air-terminals";
import { radiatorProducts, radiatorProductPhoto } from "./radiators";

const localFile = (path: string) =>
  join(process.cwd(), "public", path.replace(/^\/+/, ""));
describe("manufacturer catalog photos are available offline", () => {
  it("has a local explanatory image for all Ecoclima terminal families", () => {
    const missing = airTerminalCatalog.families
      .filter((family) => !family.image || !existsSync(localFile(family.image)))
      .map((family) => family.familyCode);
    expect(missing).toEqual([]);
    expect(airTerminalCatalog.families.length).toBe(127);
  });
  it("has an official local explanatory image for each radiator variant", () => {
    const missing = radiatorProducts
      .filter((product) => {
        const image = radiatorProductPhoto(product);
        return !image || !existsSync(localFile(image.localPath));
      })
      .map((product) => product.id);
    expect(missing).toEqual([]);
    expect(radiatorProducts.length).toBe(466);
  });
});
