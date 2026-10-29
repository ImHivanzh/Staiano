import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  markInstalled,
  recipeId,
  reconcileInstall,
} from "./plan-recognizer-setup";

const hash = (c: string) => c.repeat(64);
const script = (weights: string, sha: string, comment = "") =>
  `# ${comment}\nGet-VerifiedAsset '${weights}' $w '${sha}'\n& $py -m pip install --no-deps torch==2.8.0\nWrite-Output 'fine'\n`;
const requirements = "torch==2.8.0+cu126\nnumpy==1.26.4\n";

it("changes the recipe only when model, hash or libraries change", () => {
  const base = recipeId(
    script("https://hf.co/a/ck.pth", hash("A")),
    requirements,
  );
  expect(
    recipeId(script("https://hf.co/a/ck.pth", hash("A"), "nota"), requirements),
  ).toBe(base);
  expect(
    recipeId(script("https://hf.co/b/ck.pth", hash("A")), requirements),
  ).not.toBe(base);
  expect(
    recipeId(script("https://hf.co/a/ck.pth", hash("B")), requirements),
  ).not.toBe(base);
  expect(
    recipeId(
      script("https://hf.co/a/ck.pth", hash("A")),
      requirements + "scipy==1.17.1\n",
    ),
  ).not.toBe(base);
});

let home = "";
afterEach(async () => {
  if (home) await rm(path.dirname(home), { recursive: true, force: true });
});
async function install(files = true) {
  home = path.join(
    await mkdtemp(path.join(tmpdir(), "staiano-ai-")),
    "floorplan-ai",
  );
  await mkdir(path.join(home, "venv"), { recursive: true });
  if (files) await writeFile(path.join(home, "venv", "old-model.bin"), "x");
}
const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

it("deletes the old model when the recipe changes and keeps a current one", async () => {
  await install();
  expect(await reconcileInstall(home, "v1", true)).toBe("adopted");
  expect(
    JSON.parse(await readFile(path.join(home, "installed.json"), "utf8"))
      .recipe,
  ).toBe("v1");
  expect(await reconcileInstall(home, "v1", true)).toBe("current");
  expect(await exists(path.join(home, "venv", "old-model.bin"))).toBe(true);
  expect(await reconcileInstall(home, "v2", true)).toBe("replaced");
  expect(await exists(home)).toBe(false);
  expect(await reconcileInstall(home, "v2", false)).toBe("missing");
});

it("resumes an incomplete install instead of adopting or deleting it", async () => {
  await install();
  expect(await reconcileInstall(home, "v1", false)).toBe("missing");
  expect(await exists(path.join(home, "venv", "old-model.bin"))).toBe(true);
  await markInstalled(home, "v1");
  expect(await reconcileInstall(home, "v1", false)).toBe("missing");
});
