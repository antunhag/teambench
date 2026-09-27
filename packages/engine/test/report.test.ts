import { describe, expect, it } from "vitest";
import { createEvent } from "../src/events";
import { describeEvent, describeEvents, exportText } from "../src/report";
import type { MatchEvent, MatchRow, Player } from "../src/types";

const salvador: Player = { id: "athlete-salvador", num: "30", name: "Salvador Silva Gonçalves", pos: "Ala" };
const joao: Player = { id: "athlete-joao", num: "30", name: "João Magalhães", pos: "Pivô" };
const roster = [salvador, joao];
const byId = (id: string) => roster.find((p) => p.id === id);

const p1: Player = { id: "p1", num: "1", name: "Um", pos: "Ala" };
const p2: Player = { id: "p2", num: "2", name: "Dois", pos: "Ala" };
const p3: Player = { id: "p3", num: "3", name: "Três", pos: "Ala" };
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
