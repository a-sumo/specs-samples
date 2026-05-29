import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@vector-assets": fileURLToPath(new URL("../Assets", import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL("..", import.meta.url)),
      ],
    },
  },
});
