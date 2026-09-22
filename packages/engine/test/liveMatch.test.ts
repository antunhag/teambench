import { describe, expect, it } from "vitest";
import {
  createLiveMatchState,
  doCard,
  doFoul,
  doGoal,
  doOppGoal,
  doSub,
  endPeriod,
  endTreatment,
  goLive,
  pause,
  playerCurrentSeconds,
  resumeOrStart,
  startTreatment,
  toggleConvocado,
  toggleTitular,
} from "../src/liveMatch";

// Mesmos dois atletas do incidente real (rows.test.ts), usados aqui para
// confirmar que a orquestração completa do jogo também os mantém separados.
const salvador = "athlete-salvador";
const joao = "athlete-joao";
const guarda = "athlete-gr";
const suplente = "athlete-suplente";

describe("liveMatch — fluxo pré-jogo", () => {
  it("toggleConvocado adiciona e remove", () => {
    let s = createLiveMatchState();
    s = toggleConvocado(s, salvador);
    expect(s.convocadoIds).toEqual([salvador]);
    s = toggleConvocado(s, salvador);
    expect(s.convocadoIds).toEqual([]);
  });

  it("toggleTitular respeita o limite de 5 em quadra", () => {
    let s = createLiveMatchState(["p1", "p2", "p3", "p4", "p5", "p6"]);
    ["p1", "p2", "p3", "p4", "p5"].forEach((id) => (s = toggleTitular(s, id)));
    expect(s.onCourt).toHaveLength(5);
    s = toggleTitular(s, "p6"); // sexto não entra
    expect(s.onCourt).toHaveLength(5);
  });

  it("depois de started=true, toggleTitular não faz nada (usa-se substituição)", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    const before = s.onCourt;
    s = toggleTitular(s, joao);
    expect(s.onCourt).toBe(before);
  });
});

describe("liveMatch — relógio, golos, cartões", () => {
  it("resumeOrStart regista kickoff e começa a contar tempo para quem está em campo", () => {
    let s = createLiveMatchState([salvador, guarda]);
    s = toggleTitular(s, salvador);
    s = toggleTitular(s, guarda);
    s = goLive(s);
    s = resumeOrStart(s, 1_000);
    expect(s.clock.running).toBe(true);
    expect(s.started).toBe(true);
    expect(playerCurrentSeconds(s, salvador, 11_000)).toBe(10);
  });

  it("pause assenta o tempo de todos em campo e para o relógio", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = pause(s, 30_000, "Pedido de Tempo — Nós", "tempo_nos");
    expect(s.clock.running).toBe(false);
    expect(playerCurrentSeconds(s, salvador, 999_000)).toBe(30); // não conta mais depois de pausado
    expect(s.events.at(-1)?.type).toBe("pausa");
  });

  it("doGoal e doOppGoal recalculam o placar a partir dos eventos", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doGoal(s, salvador, null, 5_000);
    s = doOppGoal(s, 8_000);
    s = doGoal(s, salvador, null, 12_000);
    expect(s.score).toEqual({ nos: 2, advers: 1 });
  });

  it(
    "REGRESSÃO — dois atletas com o mesmo número de camisola marcam golos e são creditados " +
      "corretamente cada um ao seu próprio id, mesmo com o mesmo número de exibição",
    () => {
      let s = createLiveMatchState([salvador, joao]);
      s = toggleTitular(s, salvador);
      s = toggleTitular(s, joao);
      s = goLive(s);
      s = resumeOrStart(s, 0);
      s = doGoal(s, salvador, joao, 10_000); // Salvador marca, João assiste
      s = doGoal(s, joao, salvador, 20_000); // João marca, Salvador assiste
      const golosSalvador = s.events.filter((e) => e.type === "golo" && e.playerId === salvador);
      const golosJoao = s.events.filter((e) => e.type === "golo" && e.playerId === joao);
      expect(golosSalvador).toHaveLength(1);
      expect(golosJoao).toHaveLength(1);
      expect(s.score).toEqual({ nos: 2, advers: 0 });
    }
  );

  it("cartão vermelho tira o atleta de campo e assenta o tempo dele; amarelo não tira", () => {
    let s = createLiveMatchState([salvador, joao]);
    s = toggleTitular(s, salvador);
    s = toggleTitular(s, joao);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doCard(s, joao, "amarelo", 5_000);
    expect(s.onCourt).toContain(joao);

    s = doCard(s, joao, "vermelho", 10_000);
    expect(s.onCourt).not.toContain(joao);
    expect(playerCurrentSeconds(s, joao, 999_000)).toBe(10); // parou de contar aos 10s
    expect(playerCurrentSeconds(s, salvador, 999_000)).toBe(999); // salvador continua em campo
  });

  it("doFoul incrementa periodFouls e regista o evento", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doFoul(s, salvador, 1_000);
    s = doFoul(s, salvador, 2_000);
    expect(s.periodFouls).toBe(2);
  });

  it("substituição assenta o tempo de quem sai e começa a contar para quem entra", () => {
    let s = createLiveMatchState([salvador, suplente]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doSub(s, salvador, suplente, 15_000);
    expect(s.onCourt).toEqual([suplente]);
    expect(playerCurrentSeconds(s, salvador, 999_000)).toBe(15);
    expect(playerCurrentSeconds(s, suplente, 25_000)).toBe(10);
  });

  it("atendimento (lesão) regista início e fim com a duração certa (tempo de jogo, relógio a correr)", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0); // relógio de jogo começa a correr a partir de nowMs=0
    s = startTreatment(s, salvador, 5_000);
    expect(s.treatment?.playerId).toBe(salvador);
    s = endTreatment(s, 20_000);
    expect(s.treatment).toBeNull();
    expect(s.events.at(-1)?.durSec).toBe(15);
  });
});

describe("liveMatch — fim de parte", () => {
  it("endPeriod assenta o tempo, zera o relógio e avança a parte", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = endPeriod(s, 600_000); // 10 min de parte
    expect(s.period).toBe(2);
    expect(s.clock.elapsedMs).toBe(0);
    expect(s.clock.running).toBe(false);
    expect(playerCurrentSeconds(s, salvador, 999_999_999)).toBe(600); // assentado, não continua contando
  });

  it("cinco em quadra o tempo todo: soma dos minutos bate com 5× a duração da parte", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5"];
    let s = createLiveMatchState(ids);
    ids.forEach((id) => (s = toggleTitular(s, id)));
    s = goLive(s);
    s = resumeOrStart(s, 0);
    const durMs = 300_000; // 5 minutos
    s = endPeriod(s, durMs);
    const total = ids.reduce((acc, id) => acc + playerCurrentSeconds(s, id, durMs), 0);
    expect(total).toBe((durMs / 1000) * 5);
  });
});
