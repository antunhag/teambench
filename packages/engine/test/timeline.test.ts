import { describe, expect, it } from "vitest";
import { createEvent } from "../src/events";
import { buildTimelineData, buildTimelineHtml } from "../src/timeline";
import type { MatchEvent, Player } from "../src/types";

const salvador: Player = { id: "athlete-salvador", num: "30", name: "Salvador Silva Gonçalves", pos: "Ala" };
const joao: Player = { id: "athlete-joao", num: "30", name: "João Magalhães", pos: "Pivô" };
const guarda: Player = { id: "athlete-gr", num: "1", name: "Rui Guarda", pos: "Guarda-Redes" };
const suplente: Player = { id: "athlete-suplente", num: "8", name: "Suplente Um", pos: "Fixo" };
const roster = [salvador, joao, guarda, suplente];
const byId = (id: string) => roster.find((p) => p.id === id);

describe("buildTimelineData", () => {
  it("cobre a parte inteira para quem começou e nunca saiu", () => {
    const events: MatchEvent[] = [
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id, guarda.id]);
    expect(halves).toHaveLength(1);
    const salvadorBar = halves[0].players.find((p) => p.id === salvador.id)!;
    expect(salvadorBar.intervals).toEqual([[0, 600]]);
    expect(salvadorBar.totalSec).toBe(600);
  });

  it("fecha o intervalo de quem sai numa substituição e abre um novo para quem entra", () => {
    const events: MatchEvent[] = [
      createEvent("substituicao", suplente.id, 300_000, 1, 0, { outId: salvador.id }),
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id]);
    const salvadorBar = halves[0].players.find((p) => p.id === salvador.id)!;
    const suplenteBar = halves[0].players.find((p) => p.id === suplente.id)!;
    expect(salvadorBar.intervals).toEqual([[0, 300]]);
    expect(suplenteBar.intervals).toEqual([[300, 600]]);
  });

  it("cartão vermelho fecha o intervalo do atleta no momento exato", () => {
    const events: MatchEvent[] = [
      createEvent("cartao_vermelho", salvador.id, 200_000, 1, 0),
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id]);
    const salvadorBar = halves[0].players.find((p) => p.id === salvador.id)!;
    expect(salvadorBar.intervals).toEqual([[0, 200]]);
  });

  it("REGRESSÃO — golos dos dois atletas #30 aparecem separados na marcha do placar", () => {
    const events: MatchEvent[] = [
      createEvent("golo", salvador.id, 100_000, 1, 0),
      createEvent("golo", joao.id, 300_000, 1, 0),
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id, joao.id]);
    expect(halves[0].goals).toEqual([
      expect.objectContaining({ scorerId: salvador.id, marcha: [1, 0] }),
      expect.objectContaining({ scorerId: joao.id, marcha: [2, 0] }),
    ]);
  });

  it("golo sofrido incrementa o lado adversário na marcha, sem marcador", () => {
    const events: MatchEvent[] = [
      createEvent("golo_sofrido", null, 50_000, 1, 0),
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id]);
    expect(halves[0].goals[0]).toMatchObject({ side: "adv", scorerId: null, marcha: [0, 1] });
  });

  it("mantém quem está em campo entre partes (titular só da 1ª parte continua se ninguém saiu)", () => {
    const events: MatchEvent[] = [
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
      createEvent("fim_periodo", null, 500_000, 2, 0, { duracaoSec: 500 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id]);
    expect(halves).toHaveLength(2);
    expect(halves[1].players.find((p) => p.id === salvador.id)?.intervals).toEqual([[0, 500]]);
  });
});

describe("buildTimelineHtml", () => {
  it("gera uma página HTML autónoma com o adversário, placar e nome do marcador", () => {
    const events: MatchEvent[] = [
      createEvent("golo", salvador.id, 100_000, 1, 0),
      createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 }),
    ];
    const halves = buildTimelineData(events, roster, [salvador.id]);
    const html = buildTimelineHtml({ adversario: "Ordem", date: "20/09/2026" }, halves, 1, 0, byId);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Ordem");
    expect(html).toContain("Salvador Silva Gonçalves");
  });
});
