import { describe, expect, it } from "vitest";
import {
  createLiveMatchState,
  doCard,
  doEnter,
  doFoul,
  doFoulSuffered,
  doGoal,
  doOppGoal,
  doSub,
  endPeriod,
  endTreatment,
  foulsInPeriod,
  goLive,
  pause,
  playerCurrentSeconds,
  resumeOrStart,
  startTreatment,
  toggleConvocado,
  toggleTitular,
} from "../src/liveMatch";
import type { MatchFormat } from "../src/types";

// Mesmos dois atletas do incidente real (rows.test.ts), usados aqui para
// confirmar que a orquestração completa do jogo também os mantém separados.
const salvador = "athlete-salvador";
const joao = "athlete-joao";
const guarda = "athlete-gr";
const suplente = "athlete-suplente";

const SUB15: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };
const SUB13: MatchFormat = { periodCount: 2, periodMinutes: 20, overtimePeriodCount: 0, overtimeMinutes: 0 };
const COM_PROLONGAMENTO: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 2, overtimeMinutes: 5 };

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

  it("doFoulSuffered incrementa periodFoulsAdvers, separado de periodFouls", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doFoul(s, salvador, 1_000);
    s = doFoulSuffered(s, salvador, 2_000);
    s = doFoulSuffered(s, salvador, 3_000);
    expect(s.periodFouls).toBe(1);
    expect(s.periodFoulsAdvers).toBe(2);
    expect(foulsInPeriod(s.events, 1)).toEqual({ nos: 1, advers: 2 });
  });

  it("endPeriod reinicia periodFouls e periodFoulsAdvers para a parte seguinte", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doFoul(s, salvador, 1_000);
    s = doFoulSuffered(s, salvador, 2_000);
    s = endPeriod(s, SUB15, 3_000);
    expect(s.periodFouls).toBe(0);
    expect(s.periodFoulsAdvers).toBe(0);
    // Os eventos da parte 1 continuam contáveis por período — não desaparecem.
    expect(foulsInPeriod(s.events, 1)).toEqual({ nos: 1, advers: 1 });
    expect(foulsInPeriod(s.events, 2)).toEqual({ nos: 0, advers: 0 });
  });

  it("doEnter põe um jogador em campo sem ninguém sair, só se houver vaga (<5)", () => {
    let s = createLiveMatchState([salvador, joao]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = doEnter(s, joao, 10_000);
    expect(s.onCourt).toEqual([salvador, joao]);
    expect(playerCurrentSeconds(s, joao, 20_000)).toBe(10);

    // com 5 em campo, doEnter não faz nada
    let full = createLiveMatchState(["p1", "p2", "p3", "p4", "p5", "p6"]);
    ["p1", "p2", "p3", "p4", "p5"].forEach((id) => (full = toggleTitular(full, id)));
    full = goLive(full);
    full = resumeOrStart(full, 0);
    const before = full.onCourt;
    full = doEnter(full, "p6", 5_000);
    expect(full.onCourt).toBe(before);
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
  it("endPeriod assenta o tempo, zera o relógio e avança a parte (ainda não é a última)", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = endPeriod(s, SUB15, 600_000); // 10 min de parte, formato de 2 partes
    expect(s.period).toBe(2);
    expect(s.finished).toBe(false);
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
    s = endPeriod(s, SUB15, durMs);
    const total = ids.reduce((acc, id) => acc + playerCurrentSeconds(s, id, durMs), 0);
    expect(total).toBe((durMs / 1000) * 5);
  });

  it(
    "REGRESSÃO (bug relatado) — terminar a 2ª parte de um formato de 2 partes termina o jogo, " +
      "não avança para uma 3ª parte indefinidamente. Cada escalão/equipa respeita o seu próprio period_count.",
    () => {
      let s = createLiveMatchState([salvador]);
      s = toggleTitular(s, salvador);
      s = goLive(s);
      s = resumeOrStart(s, 0);
      s = endPeriod(s, SUB15, 1_500_000); // fim da 1ª parte (25 min)
      expect(s.finished).toBe(false);
      expect(s.period).toBe(2);

      s = resumeOrStart(s, 1_500_000);
      s = endPeriod(s, SUB15, 3_000_000); // fim da 2ª parte
      expect(s.finished).toBe(true);
      expect(s.period).toBe(2); // não vira 3 — o jogo simplesmente terminou

      // Sub-13 com partes mais curtas também respeita o SEU period_count (2), não um valor global fixo.
      let s13 = createLiveMatchState([salvador]);
      s13 = toggleTitular(s13, salvador);
      s13 = goLive(s13);
      s13 = resumeOrStart(s13, 0);
      s13 = endPeriod(s13, SUB13, 1_200_000);
      s13 = resumeOrStart(s13, 1_200_000);
      s13 = endPeriod(s13, SUB13, 2_400_000);
      expect(s13.finished).toBe(true);
    }
  );

  it("com prolongamento configurado, terminar a 2ª parte NÃO termina o jogo — só a última parte do prolongamento termina", () => {
    let s = createLiveMatchState([salvador]);
    s = toggleTitular(s, salvador);
    s = goLive(s);
    s = resumeOrStart(s, 0);
    s = endPeriod(s, COM_PROLONGAMENTO, 1_500_000); // fim da 1ª parte
    expect(s.finished).toBe(false);
    s = resumeOrStart(s, 1_500_000);
    s = endPeriod(s, COM_PROLONGAMENTO, 3_000_000); // fim da 2ª parte — ainda não é a última (há prolongamento)
    expect(s.finished).toBe(false);
    expect(s.period).toBe(3);

    s = resumeOrStart(s, 3_000_000);
    s = endPeriod(s, COM_PROLONGAMENTO, 3_300_000); // fim do prolongamento 1
    expect(s.finished).toBe(false);
    expect(s.period).toBe(4);

    s = resumeOrStart(s, 3_300_000);
    s = endPeriod(s, COM_PROLONGAMENTO, 3_600_000); // fim do prolongamento 2 — agora sim termina
    expect(s.finished).toBe(true);
    expect(s.period).toBe(4);
  });
});
