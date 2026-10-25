import { describe, expect, it } from "vitest";
import { contarCategoria, eventKey, eventosEfetivos, podeAnular, ultimoDaCategoria } from "../src/annul";
import { recomputeScoreFor } from "../src/events";
import {
  createLiveMatchState,
  doAnulacao,
  doOppGoal,
  doPerda,
  doRecuperacao,
  doRemateAdv,
  doTransicao,
  endPeriod,
  goLive,
  resumeOrStart,
  toggleTitular,
} from "../src/liveMatch";
import type { MatchFormat } from "../src/types";

const F: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

function started() {
  let s = createLiveMatchState(["a", "b", "c", "d", "gr"]);
  for (const id of ["a", "b", "c", "d", "gr"]) s = toggleTitular(s, id, 1);
  return resumeOrStart(goLive(s), 1000);
}

describe("anulação por categoria", () => {
  it("anula só o último da categoria; o anterior passa a ser o alvo seguinte", () => {
    let s = started();
    s = doTransicao(s, "ofensiva", "perdida", "3x1", 2000);
    s = doTransicao(s, "ofensiva", "ganha", "2x1", 3000);
    s = doTransicao(s, "defensiva", "perdida", "2x2", 4000);
    const ultima = ultimoDaCategoria(s.events, "transicao_favor")!;
    expect(ultima.transicaoNumeros).toBe("2x1");
    s = doAnulacao(s, eventKey(ultima), 5000);
    expect(contarCategoria(s.events, "transicao_favor", 1)).toEqual({ period: 1, total: 1 });
    expect(contarCategoria(s.events, "transicao_contra", 1)).toEqual({ period: 1, total: 1 });
    expect(ultimoDaCategoria(s.events, "transicao_favor")!.transicaoNumeros).toBe("3x1");
    // nada foi apagado: o evento anulado continua na lista bruta
    expect(s.events.filter((e) => e.type === "transicao")).toHaveLength(3);
  });

  it("golo sofrido anulado deixa de contar no placar", () => {
    let s = started();
    s = doOppGoal(s, 2000);
    s = doOppGoal(s, 3000);
    expect(s.score.advers).toBe(2);
    s = doAnulacao(s, eventKey(ultimoDaCategoria(s.events, "golo_sofrido")!), 4000);
    expect(s.score.advers).toBe(1);
    expect(recomputeScoreFor(s.events).advers).toBe(1);
  });

  it("anular a anulação reativa o original", () => {
    let s = started();
    s = doOppGoal(s, 2000);
    const golo = s.events.at(-1)!;
    s = doAnulacao(s, eventKey(golo), 3000);
    const anul = s.events.at(-1)!;
    expect(s.score.advers).toBe(0);
    s = doAnulacao(s, eventKey(anul), 4000);
    expect(s.score.advers).toBe(1);
    expect(eventosEfetivos(s.events).map((e) => e.type)).toContain("golo_sofrido");
  });

  it("rejeita alvo inexistente, de tipo não anulável ou já anulado", () => {
    let s = started();
    s = doPerda(s, "meio", 2000);
    const perda = s.events.at(-1)!;
    expect(podeAnular(s.events, "nao-existe")).toBe(false);
    expect(podeAnular(s.events, eventKey(s.events[0]))).toBe(false); // kickoff
    s = doAnulacao(s, eventKey(perda), 3000);
    expect(podeAnular(s.events, eventKey(perda))).toBe(false);
    const n = s.events.length;
    expect(doAnulacao(s, eventKey(perda), 4000).events).toHaveLength(n);
  });

  it("contagens por parte e por zona", () => {
    let s = started();
    s = doRecuperacao(s, "ataque", 2000);
    s = doRemateAdv(s, "fora", 2500);
    s = endPeriod(s, F, 3000);
    s = resumeOrStart(s, 4000);
    s = doRecuperacao(s, "ataque", 5000);
    s = doRecuperacao(s, "defesa", 6000);
    expect(contarCategoria(s.events, "recuperacao_ataque", 2)).toEqual({ period: 1, total: 2 });
    expect(contarCategoria(s.events, "recuperacao_defesa", 2)).toEqual({ period: 1, total: 1 });
    expect(contarCategoria(s.events, "remate_adv_fora", 2)).toEqual({ period: 0, total: 1 });
  });
});
