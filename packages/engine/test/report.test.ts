import { describe, expect, it } from "vitest";
import { createEvent } from "../src/events";
import { buildEventsExport, describeEvent, describeEvents, exportText, onCourtTimeline } from "../src/report";
import type { MatchEvent, MatchRow, Player } from "../src/types";

const salvador: Player = { id: "athlete-salvador", num: "30", name: "Salvador Silva Gonçalves", pos: "Ala Esquerda" };
const joao: Player = { id: "athlete-joao", num: "30", name: "João Magalhães", pos: "Pivô" };
const roster = [salvador, joao];
const byId = (id: string) => roster.find((p) => p.id === id);

const p1: Player = { id: "p1", num: "1", name: "Um", pos: "Ala Esquerda" };
const p2: Player = { id: "p2", num: "2", name: "Dois", pos: "Ala Esquerda" };
const p3: Player = { id: "p3", num: "3", name: "Três", pos: "Ala Esquerda" };
const roster3 = [p1, p2, p3];
const byId3 = (id: string) => roster3.find((p) => p.id === id);

describe("describeEvent", () => {
  it("descreve um golo com assistência, distinguindo os dois atletas #30", () => {
    const ev = createEvent("golo", salvador.id, 65_000, 1, 0, { assistId: joao.id });
    const text = describeEvent(ev, byId);
    expect(text).toContain("Salvador Silva Gonçalves");
    expect(text).toContain("João Magalhães");
    expect(text).toMatch(/^\[1ª Parte · 01:05\]/);
  });

  it("detalha a transição com a superioridade numérica quando informada", () => {
    const comDetalhe = createEvent("golo", salvador.id, 65_000, 1, 0, { tipo: "trs", transicaoNumeros: "3x1" });
    expect(describeEvent(comDetalhe, byId)).toContain("[Transição 3x1]");

    const semDetalhe = createEvent("golo", salvador.id, 65_000, 1, 0, { tipo: "trs" });
    expect(describeEvent(semDetalhe, byId)).toContain("[Transição]");
    expect(describeEvent(semDetalhe, byId)).not.toContain("[Transição ");

    const outroTipo = createEvent("golo", salvador.id, 65_000, 1, 0, { tipo: "cnt", transicaoNumeros: "3x1" });
    expect(describeEvent(outroTipo, byId)).not.toContain("3x1");

    const balizaDeserta = createEvent("golo", salvador.id, 65_000, 1, 0, { tipo: "trs", transicaoNumeros: "3x1", transicaoBalizaDeserta: true });
    expect(describeEvent(balizaDeserta, byId)).toContain("[Transição 3x1 (baliza deserta)]");
  });

  it("marca uma correção adicionada depois", () => {
    const ev = createEvent("cartao_amarelo", salvador.id, 0, 1, 0, { correcao: true, aproximado: true });
    expect(describeEvent(ev, byId)).toContain("[correção — momento aproximado]");
  });
});

describe("describeEvents", () => {
  it("recalcula 'em quadra' de um golo já registado quando uma substituição é inserida depois com tempo anterior", () => {
    const kickoff = createEvent("kickoff", null, 0, 1, 0, { lineup: [p1.id, p2.id] });
    // Golo aos 7:34, gravado com quem estava em quadra NAQUELE MOMENTO — p1,p2 (nenhuma substituição ainda existia).
    const golo = createEvent("golo", p1.id, 454_000, 1, 0, { lineup: [p1.id, p2.id] });

    // Corrigido depois: uma substituição esquecida aos 6:21 (antes do golo) — sai p2, entra p3.
    const subEsquecida = createEvent("substituicao", p3.id, 381_000, 1, 0, { outId: p2.id });

    const semCorrecao = describeEvents([kickoff, golo], byId3);
    expect(semCorrecao.get(golo.id)).toContain("em quadra: 1,2");

    const comCorrecao = describeEvents([kickoff, golo, subEsquecida], byId3);
    // Depois de inserir a substituição das 6:21, o golo das 7:34 deve refletir p3 em quadra, não mais p2.
    expect(comCorrecao.get(golo.id)).toContain("em quadra: 1,3");
    expect(comCorrecao.get(golo.id)).not.toContain("em quadra: 1,2");
  });

  it(
    "REGRESSÃO (jogo do Modicus) — uma 'entrada' sem o 'sai' correspondente (dado incongruente) " +
      "nunca deixa o 'em quadra' de um golo seguinte crescer além de 5",
    () => {
      const p4: Player = { id: "p4", num: "4", name: "Quatro", pos: "Ala Esquerda" };
      const p5: Player = { id: "p5", num: "5", name: "Cinco", pos: "Ala Esquerda" };
      const p6: Player = { id: "p6", num: "6", name: "Seis", pos: "Ala Esquerda" };
      const roster5 = [...roster3, p4, p5, p6];
      const byId5 = (id: string) => roster5.find((p) => p.id === id);

      const kickoff = createEvent("kickoff", null, 0, 1, 0, { lineup: [p1.id, p2.id, p3.id, p4.id, p5.id] });
      // Evento incongruente: p6 "entra" mas outId nunca foi preenchido (ninguém marcado como saindo) —
      // exatamente o tipo de erro que a Registo permite hoje sem nenhum aviso.
      const entradaSemSaida = createEvent("substituicao", p6.id, 100_000, 1, 0, { outId: null });
      const golo = createEvent("golo", p1.id, 200_000, 1, 0, {});

      const descriptions = describeEvents([kickoff, entradaSemSaida, golo], byId5);
      // "em quadra" nunca pode ter mais que 5 nomes, mesmo com o dado incongruente.
      const emQuadra = descriptions.get(golo.id)!.match(/em quadra: ([\d,]+)/)?.[1] ?? "";
      expect(emQuadra.split(",").length).toBeLessThanOrEqual(5);
    }
  );
});

describe("onCourtTimeline", () => {
  it("'before' de uma substituição é quem estava em quadra IMEDIATAMENTE ANTES dela, não depois", () => {
    const kickoff = createEvent("kickoff", null, 0, 1, 0, { lineup: [p1.id, p2.id] });
    const sub = createEvent("substituicao", p3.id, 100_000, 1, 0, { outId: p2.id });
    const timeline = onCourtTimeline([kickoff, sub]);
    expect(timeline.get(sub.id)?.before.sort()).toEqual([p1.id, p2.id].sort());
    expect(timeline.get(sub.id)?.after.sort()).toEqual([p1.id, p3.id].sort());
  });

  it("detecta 'entra' alguém que já está em 'before' (dado incongruente) — útil pra validar antes de salvar", () => {
    const kickoff = createEvent("kickoff", null, 0, 1, 0, { lineup: [p1.id, p2.id] });
    // p1 "entra" de novo sem nunca ter saído — a Registo permite isto hoje sem aviso nenhum.
    const entradaDuplicada = createEvent("substituicao", p1.id, 100_000, 1, 0, { outId: null });
    const timeline = onCourtTimeline([kickoff, entradaDuplicada]);
    expect(timeline.get(entradaDuplicada.id)?.before).toContain(p1.id); // já estava — "entra" não faz sentido
  });

  it("detecta 'sai' alguém que NÃO está em 'before' (dado incongruente)", () => {
    const kickoff = createEvent("kickoff", null, 0, 1, 0, { lineup: [p1.id, p2.id] });
    // p3 nunca entrou — marcar que ele "sai" não faz sentido.
    const saidaSemEntrada = createEvent("substituicao", p1.id, 100_000, 1, 0, { outId: p3.id });
    const timeline = onCourtTimeline([kickoff, saidaSemEntrada]);
    expect(timeline.get(saidaSemEntrada.id)?.before).not.toContain(p3.id);
  });
});

describe("exportText", () => {
  it("produz linhas tabuladas com o resultado e o registo cronológico", () => {
    const rows: MatchRow[] = [
      { playerId: salvador.id, num: "30", nome: salvador.name, convocado: "Sim", titular: "Sim", min: 20, golos: 1, assist: 0, ca: 0, cv: 0 },
      { playerId: joao.id, num: "30", nome: joao.name, convocado: "Sim", titular: "Não", min: 10, golos: 0, assist: 1, ca: 0, cv: 0 },
    ];
    const events: MatchEvent[] = [createEvent("golo", salvador.id, 100_000, 1, 0, { assistId: joao.id })];
    const text = exportText(rows, events, { nos: 1, advers: 0 }, byId);

    expect(text).toContain("REGISTO DE JOGO");
    expect(text).toContain("Salvador Silva Gonçalves\tSim\tSim\t20\t1\t0\t0\t0");
    expect(text).toContain("João Magalhães\tSim\tNão\t10\t0\t1\t0\t0");
    expect(text).toContain("Resultado: Nós 1 - 0 Adversário");
    expect(text).toContain("GOLO — #30 Salvador Silva Gonçalves");
  });

  it("usa o nome do clube e do adversário quando informados, em vez de 'Nós'/'Adversário'", () => {
    const text = exportText([], [], { nos: 2, advers: 1 }, byId, undefined, "AAL", "Ordem SC");
    expect(text).toContain("Resultado: AAL 2 - 1 Ordem SC");
  });
});

describe("buildEventsExport", () => {
  it("exporta cada evento com tipo, parte, tempo de jogo (segundos e mm:ss) e descrição textual", () => {
    const events: MatchEvent[] = [createEvent("golo", salvador.id, 65_000, 1, 0, { assistId: joao.id })];
    const out = buildEventsExport(events, byId, undefined, { adversario: "Ordem SC", ourLabel: "AAL", score: { nos: 1, advers: 0 } });

    expect(out.adversario).toBe("Ordem SC");
    expect(out.ourLabel).toBe("AAL");
    expect(out.score).toEqual({ nos: 1, advers: 0 });
    expect(out.events).toHaveLength(1);
    const ev = out.events[0];
    expect(ev.type).toBe("golo");
    expect(ev.period).toBe(1);
    expect(ev.timeSec).toBe(65);
    expect(ev.timeLabel).toBe("01:05");
    expect(ev.playerId).toBe(salvador.id);
    expect(ev.playerName).toBe("#30 Salvador Silva Gonçalves");
    expect(ev.assistPlayerId).toBe(joao.id);
    expect(ev.assistPlayerName).toBe("#30 João Magalhães");
    expect(ev.description).toContain("GOLO — #30 Salvador Silva Gonçalves");
  });

  it("identifica quem entra/sai numa substituição e ordena os eventos cronologicamente", () => {
    const events: MatchEvent[] = [
      createEvent("substituicao", joao.id, 100_000, 1, 0, { outId: salvador.id }),
      createEvent("kickoff", null, 0, 1, 0, { lineup: [salvador.id] }),
    ];
    const out = buildEventsExport(events, byId, undefined, { score: { nos: 0, advers: 0 } });

    expect(out.events.map((e) => e.type)).toEqual(["kickoff", "substituicao"]);
    const sub = out.events[1];
    expect(sub.playerId).toBe(joao.id);
    expect(sub.playerName).toBe("#30 João Magalhães");
    expect(sub.outPlayerId).toBe(salvador.id);
    expect(sub.outPlayerName).toBe("#30 Salvador Silva Gonçalves");
  });

  it("usa null quando não há jogador/assistência/saída associada ao evento", () => {
    const events: MatchEvent[] = [createEvent("fim_periodo", null, 600_000, 1, 0, { duracaoSec: 600 })];
    const out = buildEventsExport(events, byId, undefined, { score: { nos: 0, advers: 0 } });
    const ev = out.events[0];
    expect(ev.playerId).toBeNull();
    expect(ev.playerName).toBeNull();
    expect(ev.outPlayerId).toBeNull();
    expect(ev.assistPlayerId).toBeNull();
  });
});
