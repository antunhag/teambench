import { describe, expect, it } from "vitest";
import { createClockAccounting, markOnSince, playerSeconds, settleAll, settlePlayer } from "../src/clock";

describe("clock accounting", () => {
  it("acumula segundos enquanto o jogador está marcado em campo", () => {
    let acc = createClockAccounting();
    acc = markOnSince(acc, "p1", 0);
    expect(playerSeconds(acc, "p1", 10_000)).toBe(10); // 10s decorridos, ainda em campo
  });

  it("assenta o tempo ao sair de campo e para de contar depois", () => {
    let acc = createClockAccounting();
    acc = markOnSince(acc, "p1", 0);
    acc = settlePlayer(acc, "p1", 30_000); // saiu aos 30s
    expect(playerSeconds(acc, "p1", 30_000)).toBe(30);
    // já não está "em campo desde" nada — o relógio avançar não deve somar mais tempo
    expect(playerSeconds(acc, "p1", 999_000)).toBe(30);
  });

  it("settlePlayer não tem efeito se o jogador não estava em campo (idempotente)", () => {
    const acc = createClockAccounting();
    const after = settlePlayer(acc, "p1", 5000);
    expect(after).toEqual(acc);
  });

  it("suporta pausa e retomada: assenta, depois marca de novo em campo mais tarde", () => {
    let acc = createClockAccounting();
    acc = markOnSince(acc, "p1", 0);
    acc = settlePlayer(acc, "p1", 10_000); // pausa aos 10s -> 10s acumulados
    acc = markOnSince(acc, "p1", 10_000); // retoma no mesmo instante do relógio de jogo
    expect(playerSeconds(acc, "p1", 25_000)).toBe(25); // 10 + 15 desde a retomada
  });

  it("settleAll assenta vários jogadores em campo ao mesmo tempo", () => {
    let acc = createClockAccounting();
    acc = markOnSince(acc, "p1", 0);
    acc = markOnSince(acc, "p2", 5_000);
    acc = settleAll(acc, ["p1", "p2"], 20_000);
    expect(playerSeconds(acc, "p1", 20_000)).toBe(20);
    expect(playerSeconds(acc, "p2", 20_000)).toBe(15);
  });

  it("é imutável: as funções nunca alteram o objeto recebido", () => {
    const acc = createClockAccounting();
    const afterMark = markOnSince(acc, "p1", 0);
    expect(acc.onCourtSince).toEqual({});
    expect(afterMark).not.toBe(acc);
  });

  it(
    "REGRESSÃO — dois atletas com o mesmo número de camisola (#30) têm minutos " +
      "contados de forma totalmente independente, porque a contabilidade é " +
      "indexada por id, nunca por número. Caso real que motivou este teste: " +
      "Salvador Silva Gonçalves e João Magalhães, ambos #30 no plantel da AAL.",
    () => {
      let acc = createClockAccounting();
      const salvadorId = "athlete-salvador";
      const joaoId = "athlete-joao-magalhaes";

      acc = markOnSince(acc, salvadorId, 0);
      acc = settlePlayer(acc, salvadorId, 600_000); // Salvador joga os primeiros 10 min

      acc = markOnSince(acc, joaoId, 600_000);
      acc = settlePlayer(acc, joaoId, 900_000); // João entra e joga mais 5 min

      expect(playerSeconds(acc, salvadorId, 900_000)).toBe(600);
      expect(playerSeconds(acc, joaoId, 900_000)).toBe(300);
    }
  );
});
