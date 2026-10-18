import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // scrypt e le configurazioni via CLI costano secondi reali: sotto carico parallelo
  // il limite predefinito di 5 s faceva fallire a intermittenza src/server/auth.test.ts.
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
