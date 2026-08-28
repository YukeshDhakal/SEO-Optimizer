import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Live tests (*.live.test.ts) hit the real Google Ads API and need real
    // credentials — excluded from the default `vitest run` / `turbo test`
    // fan-out, run explicitly via `npm run test:live`.
    exclude: [...configDefaults.exclude, "**/*.live.test.ts"],
  },
});
