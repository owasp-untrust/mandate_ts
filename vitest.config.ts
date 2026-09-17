import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@untrust/mandate-core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@untrust/mandate-express": new URL("./packages/express/src/index.ts", import.meta.url).pathname,
      "@untrust/mandate-ajv": new URL("./packages/ajv/src/index.ts", import.meta.url).pathname
    }
  },
  test: { include: ["packages/*/test/**/*.test.ts"], coverage: { reporter: ["text"] } }
});
