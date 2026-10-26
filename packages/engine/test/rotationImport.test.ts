import { describe, expect, it } from "vitest";
import { parseRotationText, type ImportPlayer } from "../src/rotationImport";

const players: ImportPlayer[] = [
  { id: "dinis", name: "Dinis", num: "7" },
  { id: "felipe", name: "Felipe", num: "6" },
  { id: "marcelo", name: "Marcelo G", num: "14" },
  { id: "cartucho", name: "Cartucho", num: "19" },
  { id: "martim", name: "Martim S", num: "10" },
  { id: "rogao", name: "Rogão", num: "17" },
  { id: "leonardo", name: "Leonardo", num: "21" },
  { id: "ramalho", name: "Ramalho", num: "8" },
  { id: "salvador", name: "Salvador", num: "30" },
  { id: "henrique", name: "Henrique", num: "28" },
];
const OPTS = { periodSec: 30 * 60, periodCount: 2, applyToAllPeriods: true };

// Plano real do jogo do Póvoa (grelha da 2.ª parte; Rayan → Rogão, Rodrigo M → Henrique).
const POVOA = `
Fixo: Dinis 0-6, Felipe 6-11, Dinis 11-16, Felipe 16-21, Marcelo G 21-25, Dinis 25-30
Pivô: Cartucho 0-3, Rogão 3-6, Cartucho 6-12, Rogão 12-16, Cartucho 16-21, Martim S 21-25, Cartucho 25-30
Ala esquerda: Felipe 0-3, Leonardo 3-6, Martim S 6-9, Ramalho 9-12, Martim S 12-17, Ramalho 17-21, Leonardo 21-25, Felipe 25-30
Ala direita: Salvador 0-3, Marcelo G 3-6, Henrique 6-9, Marcelo G 9-12, Leonardo 12-16, Salvador 16-21, Henrique 21-26, Salvador 26-30
`;

describe("parseRotationText", () => {
  it("plano do Póvoa: sem erros nem buracos; replicado nas duas partes com a opção", () => {
    const r = parseRotationText(POVOA, players, OPTS);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.stints).toHaveLength(29 * 2);
    expect(r.stints.filter((s) => s.period === 2)).toHaveLength(29);
    expect(r.stints.find((s) => s.slotIndex === 3 && s.startSec === 720 && s.period === 1)).toMatchObject({ playerId: "rogao", endSec: 960 });
    // Fixo = índice 0, Ala esquerda = 1, Ala direita = 2, Pivô = 3 (ROTATION_SLOT_TYPES)
    expect(r.stints.find((s) => s.playerId === "henrique")).toMatchObject({ slotIndex: 2, startSec: 360, endSec: 540 });
  });

  it("só a parte 1 sem a opção; cabeçalhos 'Parte N' mandam", () => {
    expect(parseRotationText("Fixo: Dinis 0-30", players, { ...OPTS, applyToAllPeriods: false }).stints.map((s) => s.period)).toEqual([1]);
    const r = parseRotationText("Parte 2\nFixo: Dinis 0-30", players, OPTS);
    expect(r.stints.map((s) => s.period)).toEqual([2]);
  });

  it("aceita abreviaturas, travessão, mm:ss, acentos e prefixo único", () => {
    const r = parseRotationText("PV: rogao 0–12:30; Cartucho 12:30-30\nfx: Dinis 0-30\nAE: Martim 0-30\nad: #30 0-30", players, { ...OPTS, applyToAllPeriods: false });
    expect(r.errors).toEqual([]);
    expect(r.stints[0]).toMatchObject({ playerId: "rogao", slotIndex: 3, endSec: 750 });
    expect(r.stints.find((s) => s.slotIndex === 1)!.playerId).toBe("martim");
    expect(r.stints.find((s) => s.slotIndex === 2)!.playerId).toBe("salvador");
  });

  it("nome inexistente ou ambíguo é erro", () => {
    const amb = [...players, { id: "marcelo2", name: "Marcelo R", num: "4" }];
    const r = parseRotationText("Fixo: Gaspar 0-5, Marcelo 5-30", amb, OPTS);
    expect(r.errors.join("\n")).toMatch(/Gaspar" não está no plantel/);
    expect(r.errors.join("\n")).toMatch(/Marcelo" é ambíguo/);
  });

  it("vaga desconhecida, formato inválido, fora da parte e fim antes do início", () => {
    const r = parseRotationText("Guarda-redes: Dinis 0-30\nFixo: Dinis\nPivô: Cartucho 0-31\nAD: Salvador 10-5", players, OPTS);
    expect(r.errors).toHaveLength(4);
    expect(r.stints).toHaveLength(0);
  });

  it("sobreposição na mesma vaga e atleta em duas vagas ao mesmo tempo", () => {
    const r = parseRotationText("Fixo: Dinis 0-10, Cartucho 5-30\nPivô: Dinis 8-12", players, { ...OPTS, applyToAllPeriods: false });
    expect(r.errors.some((e) => /sobrepõe-se/.test(e))).toBe(true);
    expect(r.errors.some((e) => /já está em Fixo/.test(e))).toBe(true);
  });

  it("buracos são aviso, não erro", () => {
    const r = parseRotationText("Fixo: Dinis 0-10, Cartucho 12-30", players, { ...OPTS, applyToAllPeriods: false });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContain("Fixo, parte 1: ninguém de 10 a 12");
    expect(r.warnings.some((w) => /Pivô, parte 1: ninguém de 0 a 30/.test(w))).toBe(true);
  });

  it("texto vazio", () => {
    expect(parseRotationText("  \n", players, OPTS).errors).toEqual(["Nenhum turno encontrado no texto."]);
  });
});
