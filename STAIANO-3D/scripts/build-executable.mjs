import { execFileSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";
import bytenode from "bytenode";
import { executableIcon } from "./executable-icon.mjs";

if (
  process.platform !== "win32" ||
  process.arch !== "x64" ||
  process.version !== "v24.14.0"
)
  throw new Error(
    "La build richiede Node.js 24.14.0 su Windows x64 (anche un runner CI temporaneo).",
  );
const root = process.cwd(),
  dist = process.env.STAIANO_BUILD_DIR || ".next";
if (![".next", ".next-update"].includes(dist))
  throw new Error("Directory di build non valida.");
const output = path.join(root, "dist-exe"),
  stage = path.join(output, `stage-${Date.now()}`);
const runtime = path.join(stage, "runtime");
await mkdir(output, { recursive: true });
const publicKey =
  process.env.LICENSE_PUBLIC_KEY ||
  (await readFile(
    process.env.LICENSE_PUBLIC_KEY_FILE ||
      path.join(root, "deploy", "license-public.pem"),
    "utf8",
  ));
if (createPublicKey(publicKey).asymmetricKeyType !== "ed25519")
  throw new Error("Chiave pubblica Ed25519 richiesta.");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const dirty = Boolean(
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
);
const generated = await readFile(path.join(root, "next-env.d.ts"));
try {
  if (!process.argv.includes("--skip-build")) {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "deploy", "build-dwg.ps1"),
      ],
      { cwd: root, stdio: "inherit" },
    );
    execFileSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "npm run build"],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          STAIANO_BUILD_DIR: dist,
          STAIANO_PACKAGE: "1",
          NODE_ENV: "production",
        },
      },
    );
  }
} finally {
  await writeFile(path.join(root, "next-env.d.ts"), generated);
}

async function files(directory, prefix = "") {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink())
      throw new Error(
        `Collegamento inatteso nel pacchetto: ${prefix}${item.name}`,
      );
    const name = prefix + item.name;
    if (item.isDirectory())
      result.push(
        ...(await files(path.join(directory, item.name), `${name}/`)),
      );
    else result.push(name);
  }
  return result;
}

try {
  const standalone = path.join(root, dist, "standalone");
  await cp(standalone, runtime, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const name = path.relative(standalone, source).replaceAll("\\", "/");
      return (
        (!name ||
          [dist, "node_modules", "package.json", "server.js"].includes(
            name.split("/")[0],
          )) &&
        !/(^|\/)\.env[^/]*$|\.map$|\.tsx?$|\.pdb$/i.test(name)
      );
    },
  });
  await cp(path.join(root, "public"), path.join(runtime, "public"), {
    recursive: true,
  });
  await cp(
    path.join(root, dist, "static"),
    path.join(runtime, dist, "static"),
    { recursive: true, filter: (source) => !source.endsWith(".map") },
  );
  await cp(
    path.join(root, "native/runtime"),
    path.join(runtime, "native/runtime"),
    {
      recursive: true,
      filter: (source) =>
        !source.endsWith(".pdb") && path.basename(source) !== "plan-ai.json",
    },
  );
  await cp(
    path.join(root, "native/PlanRecognizer"),
    path.join(runtime, "native/PlanRecognizer"),
    { recursive: true },
  );
  await mkdir(path.join(runtime, "deploy"), { recursive: true });
  await cp(
    path.join(root, "deploy/setup-plan-recognizer.ps1"),
    path.join(runtime, "deploy/setup-plan-recognizer.ps1"),
  );
  const scanner = path.join(runtime, "native/pantum/scansione.pyc");
  await mkdir(path.dirname(scanner), { recursive: true });
  execFileSync(
    process.env.STAIANO_SCANNER_PYTHON || "python",
    [
      "-c",
      "import py_compile,sys; py_compile.compile(sys.argv[1],cfile=sys.argv[2],dfile='StaianoScanner',doraise=True)",
      path.join(root, "native/pantum/scansione.py"),
      scanner,
    ],
    { stdio: "inherit" },
  );
  let compiled = 0;
  for (const name of await files(path.join(runtime, dist, "server"))) {
    // Next evaluates these data records in a VM without CommonJS module/require.
    if (!name.endsWith(".js") || path.basename(name).includes("manifest"))
      continue;
    const source = path.join(runtime, dist, "server", name);
    await bytenode.compileFile({
      filename: source,
      output: `${source}c`,
      compileAsModule: true,
      compress: true,
    });
    await writeFile(
      source,
      `module.exports = require(${JSON.stringify(`./${path.basename(name)}c`)});\n`,
    );
    compiled++;
  }
  // Production dependencies are required for Next; no project TS/TSX, maps, credentials or repository metadata may ship.
  // Il bridge del riconoscitore di planimetrie parte come sorgente con il Python 3.12 del server.
  const shippedPython = /^native\/PlanRecognizer\/[^/]+\.py$/i;
  const names = await files(runtime);
  for (const name of names) {
    if (
      !shippedPython.test(name) &&
      /(^|\/)(\.env[^/]*|\.git)(\/|$)|\.map$|\.tsx?$|\.py$|license-private|license\.json|app-auth\.json/i.test(
        name,
      )
    )
      throw new Error(`File vietato nel pacchetto: ${name}`);
  }
  const archive = [];
  for (const name of names)
    archive.push([
      name,
      // Ogni file è compresso a parte: un unico JSON di base64 supera il limite di stringa di V8 (~512 MB) con i modelli 3D.
      gzipSync(await readFile(path.join(runtime, name)), { level: 9 }).toString("base64"),
    ]);
  await writeFile(
    path.join(stage, "runtime.gz"),
    gzipSync(Buffer.from(JSON.stringify(archive)), { level: 9 }),
  );
  const buildId = (
    await readFile(path.join(root, dist, "BUILD_ID"), "utf8")
  ).trim();
  const config = {
    buildId,
    commit,
    dirty,
    publicKey,
    node: process.version,
    python: execFileSync(
      process.env.STAIANO_SCANNER_PYTHON || "python",
      ["--version"],
      { encoding: "utf8" },
    ).trim(),
  };
  await writeFile(path.join(stage, "config.json"), JSON.stringify(config));
  await bytenode.compileFile({
    filename: path.join(root, "deploy/executable.cjs"),
    output: path.join(stage, "launcher.jsc"),
    compileAsModule: true,
    compress: true,
  });
  const require = createRequire(import.meta.url);
  const library = await readFile(require.resolve("bytenode"), "utf8");
  const loader = `const _runtime={exports:{}}; (function(module,exports){\n${library}\n})(_runtime,_runtime.exports);\nconst _start=_runtime.exports.runBytecode(Buffer.from(require('node:sea').getAsset('launcher')));\n_start(exports,require,module,process.execPath,require('node:path').dirname(process.execPath));\n`;
  await writeFile(path.join(stage, "loader.cjs"), loader);
  const seaConfig = path.join(stage, "sea.json");
  const blob = path.join(stage, "sea.blob");
  await writeFile(
    seaConfig,
    JSON.stringify({
      main: path.join(stage, "loader.cjs"),
      output: blob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
      execArgvExtension: "none",
      assets: {
        runtime: path.join(stage, "runtime.gz"),
        config: path.join(stage, "config.json"),
        launcher: path.join(stage, "launcher.jsc"),
      },
    }),
  );
  execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], {
    stdio: "inherit",
  });
  const exe = path.join(output, "StaianoHVAC.exe");
  await cp(process.execPath, exe);
  await executableIcon(exe, path.join(root, "deploy", "staiano.ico"));
  execFileSync(
    process.execPath,
    [
      require.resolve("postject/dist/cli.js"),
      exe,
      "NODE_SEA_BLOB",
      blob,
      "--sentinel-fuse",
      "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ],
    { stdio: "inherit" },
  );
  const sha256 = createHash("sha256")
    .update(await readFile(exe))
    .digest("hex");
  await writeFile(
    path.join(output, "release.json"),
    JSON.stringify(
      {
        ...config,
        sha256,
        size: (await stat(exe)).size,
        compiledModules: compiled,
        runtimeFiles: names.length,
      },
      null,
      2,
    ),
  );
  console.log(
    `EXE pronto: ${exe} (${compiled} moduli in bytecode). SHA-256: ${sha256}`,
  );
} finally {
  const resolved = path.resolve(stage);
  if (!resolved.startsWith(`${path.resolve(output)}${path.sep}`))
    throw new Error("Directory temporanea fuori dal workspace.");
  await rm(resolved, { recursive: true, force: true });
}
