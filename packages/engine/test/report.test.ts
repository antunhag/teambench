import { describe, expect, it } from "vitest";
import { createEvent } from "../src/events";
import { describeEvent, exportText } from "../src/report";
import type { MatchEvent, MatchRow, Player } from "../src/types";

const salvador: Player = { id: "athlete-salvador", num: "30", name: "Salvador Silva Gonçalves", pos: "Ala" };
const joao: Player = { id: "athlete-joao", num: "30", name: "João Magalhães", pos: "Pivô" };
const roster = [salvador, joao];
const byId = (id: string) => roster.find((p) => p.id === id);

describe("describeEvent", () => {
  it("descreve um golo com assistência, distinguindo os dois atletas #30", () => {
    const ev = createEvent("golo", salvador.id, 65_000, 1, 0, { assistId: joao.id });
    const text = describeEvent(ev, byId);
    expect(text).toContain("Salvador Silva Gonçalves");
    expect(text).toContain("João Magalhães");
    expect(text).toMatch(/^\[1ª Parte · 01:05\]/);
  });

  it("marca uma correção adicionada depois", () => {
    const ev = createEvent("cartao_amarelo", salvador.id, 0, 1, 0, { correcao: true, aproximado: true });
    expect(describeEvent(ev, byId)).toContain("[correção — momento aproximado]");
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
});
