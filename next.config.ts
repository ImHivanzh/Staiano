import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["hvac.internal.staianopoint.com"],
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": [".cache/**/*", ".env*"] },
};
export default config;
