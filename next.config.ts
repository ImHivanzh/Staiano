import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": [".cache/**/*", ".env*"] },
};
export default config;
