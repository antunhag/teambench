import { describe, expect, it } from "vitest";
import {
  createLiveMatchState,
  doFoul,
  doGoal,
  doSub,
  endPeriod,
  playerCurrentSeconds,
  resumeOrStart,
} from "../src/liveMatch";
import { replayEvents } from "../src/replay";
import type { MatchFormat } from "../src/types";

const SUB15: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

const p1 = "athlete-1";
const p2 = "athlete-2";
const p3 = "athlete-3";
const convocados = [p1, p2, p3];

describe("replayEvents", () => {
  it("reconstrói placar, em campo, faltas e tempo em quadra a partir só dos eventos, para um jogo terminado", () => {
    let live = createLiveMatchState(convocados);
    live = { ...live, onCourt: [p1, p2] };
    live = resumeOrStart(live, 0);
    live = doGoal(live, p1, null, 10_000);
    live = doFoul(live, p2, 20_000);
    live = doSub(live, p2, p3, 30_000); // sai p2, entra p3
    live = endPeriod(live, SUB15, 25 * 60_000); // fim da parte 1 de 2 — ainda não termina o jogo

    const replayed = replayEvents(convocados, live.events, SUB15);

    expect(replayed.score).toEqual(live.score);
    expect(replayed.periodFouls).toBe(live.periodFouls);
    expect(new Set(replayed.onCourt)).toEqual(new Set(live.onCourt));
    expect(replayed.started).toBe(true);
    expect(replayed.finished).toBe(live.finished);
    expect(replayed.period).toBe(live.period);
    expect(playerCurrentSeconds(replayed, p1, 999_999)).toBeCloseTo(playerCurrentSeconds(live, p1, 999_999), 3);
    expect(playerCurrentSeconds(replayed, p2, 999_999)).toBeCloseTo(playerCurrentSeconds(live, p2, 999_999), 3);
    expect(playerCurrentSeconds(replayed, p3, 999_999)).toBeCloseTo(playerCurrentSeconds(live, p3, 999_999), 3);
  });

  it("uma parte com kickoff mas sem fim_periodo (aparelho falhou a meio) fica 'aguardando apito', nunca com relógio de parede reanimado", () => {
    let live = createLiveMatchState(convocados);
    live = { ...live, onCourt: [p1, p2] };
    live = resumeOrStart(live, 0);
    live = doGoal(live, p1, null, 15_000);

    const replayed = replayEvents(convocados, live.events, SUB15);

    expect(replayed.started).toBe(true);
    expect(replayed.finished).toBe(false);
    expect(replayed.clock.running).toBe(false);
    expect(replayed.clock.elapsedMs).toBe(15_000);
    expect(replayed.score.nos).toBe(1);
  });

  it("sem nenhum evento, devolve o estado vazio de sempre (jogo nunca começou)", () => {
    const replayed = replayEvents(convocados, [], SUB15);
    expect(replayed.started).toBe(false);
    expect(replayed.events).toEqual([]);
  });

  it("sem um evento de kickoff para a parte 2, quem não foi tocado por nenhuma substituição não acumula tempo na parte 2 — mesmo corrigindo o tempo dos eventos existentes", () => {
    let live = createLiveMatchState(convocados);
    live = { ...live, onCourt: [p1, p2] };
    live = resumeOrStart(live, 0);
    live = endPeriod(live, { ...SUB15, periodCount: 4 }, 25 * 60_000); // não é a última parte — segue pra parte 2

    // Parte 2: substituição registada em ms=0 por causa do bug (o botão "Iniciar Parte 2" sumido — o mesmo cenário
    // real corrigido nesta sessão). Corrigimos aqui o tempo dessa substituição (MatchEventEditor), mas nenhum
    // evento de "kickoff" da parte 2 chegou a existir (ele também nunca foi criado, por causa do mesmo bug).
    live = doSub(live, p2, p3, 0);
    const correctedEvents = live.events.map((e) =>
      e.type === "substituicao" && e.period === 2 ? { ...e, ms: 5 * 60_000, min: 5, sec: 0 } : e
    );

    const replayed = replayEvents(convocados, correctedEvents, { ...SUB15, periodCount: 4 });
    // p1 ficou em quadra o jogo todo mas nunca foi "remarcado" por um kickoff da parte 2 — só tem a parte 1 contada.
    expect(playerCurrentSeconds(replayed, p1, 999_999)).toBeCloseTo(25 * 60, 0);
    // p3 entrou exatamente no instante em que o relógio ficou parado (última posição conhecida) — zero decorrido.
    expect(playerCurrentSeconds(replayed, p3, 999_999)).toBeCloseTo(0, 0);
  });
});
