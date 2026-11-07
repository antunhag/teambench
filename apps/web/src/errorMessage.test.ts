import { describe, expect, it } from "vitest";
import { textoDeErro, toErrorMessage, traduzirErro } from "./errorMessage";

describe("traduzirErro", () => {
  it("rede", () => {
    expect(traduzirErro("TypeError: Failed to fetch")).toMatch(/Sem ligação/);
    expect(traduzirErro("Load failed")).toMatch(/Sem ligação/);
  });
  it("guarda de UPDATE da 0026", () => {
    expect(
      traduzirErro("match_events: UPDATE que muda dado precisa de payload.correcao = true (correção explícita)")
    ).toMatch(/só pode ser alterado como correção/);
  });
  it("RLS", () => {
    expect(traduzirErro('new row violates row-level security policy for table "match_events"')).toMatch(/permissão/);
  });
  it("código expirado e limite de pedidos", () => {
    expect(traduzirErro("Token has expired or is invalid")).toMatch(/código/);
    expect(traduzirErro("For security purposes, you can only request this after 42 seconds.")).toMatch(/Espera/);
  });
  it("desconhecido mantém o detalhe, sem jargão à volta", () => {
    expect(traduzirErro("xyz")).toBe("Algo correu mal (detalhe: xyz).");
    expect(traduzirErro("")).toBe("Algo correu mal. Tenta outra vez.");
  });
});

describe("textoDeErro", () => {
  it("aceita objetos planos do Supabase", () => {
    expect(toErrorMessage({ message: "Failed to fetch" })).toBe("Failed to fetch");
    expect(textoDeErro({ message: "Failed to fetch" })).toMatch(/Sem ligação/);
  });
});
