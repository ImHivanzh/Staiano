import { build } from "esbuild";
await build({
  entryPoints: {
    "plan.worker": "src/workers/plan.worker.ts",
    "project.worker": "src/workers/project.worker.ts",
    "size.worker": "src/domain/radiators/size.worker.ts",
  },
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: "es2022",
  outdir: "public/workers",
});
