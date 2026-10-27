import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = (path) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

// Em desenvolvimento, aponta para o código-fonte dos pacotes: alterações na
// biblioteca aparecem na hora, sem precisar rodar o build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@swalay/poly-react/styles.css", replacement: pkg("react/src/styles.css") },
      { find: "@swalay/poly-react", replacement: pkg("react/src/index.ts") },
      { find: "@swalay/poly-core", replacement: pkg("core/src/index.ts") },
    ],
  },
});
