import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.STAIANO_BUILD_DIR ?? ".next",
  output: process.env.STAIANO_PACKAGE === "1" ? "standalone" : undefined,
  allowedDevOrigins: ["hvac.internal.staianopoint.com"],
  poweredByHeader: false,
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
