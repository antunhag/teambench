import { describe, expect, it } from "vitest";
import { createClockAccounting, markOnSince, settlePlayer } from "../src/clock";
import { createEvent } from "../src/events";
import { buildRows, rebuildHistoryRows } from "../src/rows";
import type { MatchEvent, MatchRow, Player } from "../src/types";

// Caso real (AAL-NEW, temporada em curso): dois atletas usam genuinamente o
// mesmo número de camisola #30. Antes da correção arquitetural que este
// pacote porta, as linhas arquivadas de um jogo só guardavam num+nome, o que
// forçava "adivinhar" a identidade por número ao reabrir um jogo antigo —
// e quebrava exatamente neste cenário. Estes testes existem para nunca deixar
// essa classe de bug voltar.
const salvador: Player = { id: "athlete-salvador", num: "30", name: "Salvador Silva Gonçalves", pos: "Ala" };
const joao: Player = { id: "athlete-joao", num: "30", name: "João Magalhães", pos: "Pivô" };
const guarda: Player = { id: "athlete-gr", num: "1", name: "Rui Guarda", pos: "Guarda-Redes" };

describe("buildRows", () => {
  it("mantém golos/minutos de dois atletas com o mesmo número totalmente separados", () => {
    let clock = createClockAccounting();
    clock = markOnSince(clock, salvador.id, 0);
    clock = settlePlayer(clock, salvador.id, 600_000); // Salvador: 10 min
    clock = markOnSince(clock, joao.id, 600_000);
    clock = settlePlayer(clock, joao.id, 900_000); // João: 5 min

    const events: MatchEvent[] = [
      createEvent("golo", salvador.id, 300_000, 1, 0),
      createEvent("golo", joao.id, 800_000, 1, 0, { assistId: salvador.id }),
    ];

    const rows = buildRows({
      convocados: [salvador, joao, guarda],
      titularIds: [salvador.id, guarda.id],
      events,
      clock,
      nowMs: 900_000,
    });

    const salvadorRow = rows.find((r) => r.playerId === salvador.id)!;
    const joaoRow = rows.find((r) => r.playerId === joao.id)!;

    expect(salvadorRow.num).toBe("30");
    expect(joaoRow.num).toBe("30");
    expect(salvadorRow.min).toBe(10);
    expect(joaoRow.min).toBe(5);
    expect(salvadorRow.golos).toBe(1);
    expect(joaoRow.golos).toBe(1);
    expect(salvadorRow.assist).toBe(1); // Salvador assistiu o golo do João
    expect(joaoRow.assist).toBe(0);
    expect(salvadorRow.titular).toBe("Sim");
    expect(joaoRow.titular).toBe("Não");
  });
});

describe("rebuildHistoryRows", () => {
  it("resolve identidade por playerId mesmo com números repetidos (jogos arquivados a partir da correção)", () => {
    const rows: MatchRow[] = [
      { playerId: salvador.id, num: "30", nome: salvador.name, convocado: "Sim", titular: "Sim", min: 10, golos: 0, assist: 0, ca: 0, cv: 0 },
      { playerId: joao.id, num: "30", nome: joao.name, convocado: "Sim", titular: "Não", min: 5, golos: 0, assist: 0, ca: 0, cv: 0 },
    ];
    // Correção adicionada depois: um golo esquecido do João.
    const events: MatchEvent[] = [createEvent("golo", joao.id, 850_000, 1, 0, { correcao: true })];

    const rebuilt = rebuildHistoryRows(rows, events, [salvador, joao]);

    expect(rebuilt.find((r) => r.playerId === salvador.id)!.golos).toBe(0);
    expect(rebuilt.find((r) => r.playerId === joao.id)!.golos).toBe(1);
  });

  it(
    "LIMITAÇÃO CONHECIDA E ACEITE — jogos arquivados ANTES de existir playerId " +
      "(sem esse campo na linha) caem no casamento por num+nome; com números " +
      "repetidos isso pode casar com o atleta errado. Isto documenta o " +
      "comportamento legado, não é uma regressão a corrigir aqui.",
    () => {
      const legacyRows: MatchRow[] = [
        { playerId: "", num: "30", nome: salvador.name, convocado: "Sim", titular: "Sim", min: 10, golos: 0, assist: 0, ca: 0, cv: 0 },
      ];
      const events: MatchEvent[] = [createEvent("golo", joao.id, 100_000, 1, 0)];

      const rebuilt = rebuildHistoryRows(legacyRows, events, [salvador, joao]);

      // Casa por num+nome -> encontra o Salvador (nome bate), não conta o golo do João.
      expect(rebuilt[0].playerId).toBe(salvador.id);
      expect(rebuilt[0].golos).toBe(0);
    }
  );
});
