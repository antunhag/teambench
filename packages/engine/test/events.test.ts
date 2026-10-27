import { describe, expect, it } from "vitest";
import { createEvent, juntarComServidor, recomputeScoreFor, semEventosDeEscalacao } from "../src/events";
import type { MatchEvent } from "../src/types";

describe("events", () => {
  it("createEvent deriva min/sec a partir de ms", () => {
    const ev = createEvent("golo", "p1", 125_000, 1, 1700000000000);
    expect(ev.min).toBe(2);
    expect(ev.sec).toBe(5);
    expect(ev.period).toBe(1);
    expect(ev.playerId).toBe("p1");
  });

  it("recomputeScoreFor conta só eventos de golo, ignorando o resto", () => {
    const events: MatchEvent[] = [
      createEvent("golo", "p1", 0, 1, 0),
      createEvent("golo", "p2", 0, 1, 0),
      createEvent("golo_sofrido", null, 0, 1, 0),
      createEvent("cartao_amarelo", "p1", 0, 1, 0),
      createEvent("falta", "p2", 0, 1, 0),
    ];
    expect(recomputeScoreFor(events)).toEqual({ nos: 2, advers: 1 });
  });

  it("placar nunca dessincroniza: apagar um evento de golo da lista muda o placar automaticamente", () => {
    const golo = createEvent("golo", "p1", 0, 1, 0);
    let events: MatchEvent[] = [golo, createEvent("golo_sofrido", null, 0, 1, 0)];
    expect(recomputeScoreFor(events)).toEqual({ nos: 1, advers: 1 });

    events = events.filter((e) => e.id !== golo.id); // simula "desfazer" o golo
    expect(recomputeScoreFor(events)).toEqual({ nos: 0, advers: 1 });
  });
});

describe("semEventosDeEscalacao", () => {
  it("tira convocatória/titulares e mantém os eventos de jogo", () => {
    const evs = ["convocado_add", "titular_add", "kickoff", "golo", "convocado_remove", "titular_remove", "fim_periodo"].map(
      (type, i) => ({ id: String(i), type, playerId: null, ms: 0, min: 0, sec: 0, period: 1, ts: i }) as MatchEvent
    );
    expect(semEventosDeEscalacao(evs).map((e) => e.type)).toEqual(["kickoff", "golo", "fim_periodo"]);
  });
});

describe("juntarComServidor", () => {
  const ev = (id: string, type: MatchEvent["type"] = "falta") => ({ id, clientEventId: id, type, playerId: null, ms: 0, min: 0, sec: 0, period: 1, ts: 0 }) as MatchEvent;
  const corrigido = { ...ev("a"), ms: 5000, correcao: true };

  it("a versão do servidor ganha; locais por sincronizar ficam", () => {
    const r = juntarComServidor([corrigido, ev("b")], [ev("a"), ev("b"), ev("c")], new Set(["c"]));
    expect(r.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(r[0].ms).toBe(5000);
  });

  it("local já sincronizado e apagado no servidor não volta", () => {
    expect(juntarComServidor([ev("b")], [ev("a"), ev("b")], new Set()).map((e) => e.id)).toEqual(["b"]);
  });

  it("sem saber o que está por sincronizar, mantém todos os locais", () => {
    expect(juntarComServidor([ev("b")], [ev("a"), ev("b")], null).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
