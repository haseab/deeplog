import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "description-worker.test.ts",
      "optimistic-entries.test.ts",
      "split-entry-dialog.test.ts",
    ],
  },
});
