import { defineConfig } from "vitest/config";

// Separate config for the live/sandbox suite so it never gets picked up by
// the default `vitest run` (and therefore never by `turbo test`'s fan-out,
// which has no credentials to give it). Run explicitly: `npm run test:live`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.live.test.ts"],
  },
});
