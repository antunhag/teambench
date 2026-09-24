import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  server: { port: 5173 },
  // GitHub Pages serve o site em antunhag.github.io/teambench/, não na raiz —
  // sem isto os assets seriam pedidos a partir de "/", dando 404.
  base: "/teambench/",
});
