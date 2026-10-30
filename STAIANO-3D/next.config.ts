import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.STAIANO_BUILD_DIR ?? ".next",
  output: process.env.STAIANO_PACKAGE === "1" ? "standalone" : undefined,
  allowedDevOrigins: ["hvac.internal.staianopoint.com"],
  poweredByHeader: false,
  // Il Proxy bufferizza il body e lo tronca a 10 MB: i limiti reali sono in MAX_PROJECT_BYTES e MAX_SKETCHUP_BYTES.
  experimental: { proxyClientMaxBodySize: "128mb" },
  outputFileTracingExcludes: {
    "/*": [
      ".cache/**/*",
      ".env*",
      "catalog-data/sources/**/*",
      "native/**/*",
      "dist-exe/**/*",
      "output/**/*",
      "test-results*/**/*",
      "tests/**/*",
      "src/**/*.test.*",
      ".impeccable/**/*",
    ],
  },
};
export default config;
