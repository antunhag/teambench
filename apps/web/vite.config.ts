import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    preact(),
    // Cobertura offline do "app shell" (HTML/JS/CSS) — sem isto, o teambench
    // não abre de todo sem rede, mesmo já tendo sido carregado antes: ao
    // contrário do banco.html original (um único index.html sem build), o
    // Vite gera ficheiros com hash a cada deploy, então o service worker
    // precisa de saber exatamente quais ficheiros cachear a cada build — é
    // isso que o generateSW faz (gera a lista automaticamente).
    //
    // Propositadamente NÃO cacheia chamadas ao Supabase: os dados do jogo já
    // são local-first via localStorage + fila de sincronização (ver
    // apps/web/src/sync/outbox.ts) — deixar o service worker também cachear
    // respostas da API só arriscaria servir dados/sessão desatualizados.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Teambench",
        short_name: "Teambench",
        description: "Registo de jogo ao vivo para futsal — Banco Sub-15",
        start_url: "/teambench/",
        scope: "/teambench/",
        display: "standalone",
        background_color: "#f3f6f2",
        theme_color: "#1f7a4d",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Só o build do próprio app — nunca origens externas (Supabase, Google Fonts).
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: { port: 5173 },
  // GitHub Pages serve o site em antunhag.github.io/teambench/, não na raiz —
  // sem isto os assets seriam pedidos a partir de "/", dando 404.
  base: "/teambench/",
});
