import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.STAIANO_BUILD_DIR ?? ".next",
  allowedDevOrigins: ["hvac.internal.staianopoint.com"],
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": [".cache/**/*", ".env*"] },
};
export default config;
