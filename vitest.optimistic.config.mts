import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "entry-search-ui.test.ts",
      "bulk-transactions-ui.test.ts",
      "description-worker.test.ts",
      "optimistic-entries.test.ts",
      "split-entry-dialog.test.ts",
      "responsive-editors.test.ts",
    ],
  },
});
