import { build } from "esbuild";
await build({
  stdin: {
    contents:
      "import {startRegistration,startAuthentication} from '@simplewebauthn/browser'; window.LicensePasskeys={startRegistration,startAuthentication};",
    resolveDir: process.cwd(),
  },
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: "es2022",
  outfile: "license-server/public/webauthn.js",
});
