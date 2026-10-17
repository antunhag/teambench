import { defineConfig } from "vitest/config";

// Config independente da de produção (apps/web/vite.config.ts) — não há
// aliases nem opções de build de que estes testes dependam, e o vite.config
// de produção regista o plugin VitePWA (gera service worker/manifesto), que
// não tem razão nenhuma para correr durante testes unitários de lógica pura.
// Ambiente "node": nenhum teste aqui precisa de DOM (outbox.ts/
// outboxFlusher.ts não tocam componentes Preact, só localStorage + um
// cliente Supabase injetado/simulado).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
