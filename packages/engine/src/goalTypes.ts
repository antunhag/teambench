// Tipo de jogada que originou o golo — mesmas categorias usadas na folha de
// estatísticas em Excel do banco.html original (ORG/TRS/LVR/PNT/CNT/PPB).
export interface GoalType {
  id: string;
  abbr: string;
  label: string;
}

export const TIPOS_GOLO: GoalType[] = [
  { id: "org", abbr: "ORG", label: "Organização ofensiva" },
  { id: "trs", abbr: "TRS", label: "Transição" },
  { id: "lvr", abbr: "LVR", label: "Livre (frontal/lateral)" },
  { id: "pnt", abbr: "PNT", label: "Penálti" },
  { id: "cnt", abbr: "CNT", label: "Canto" },
  { id: "ppb", abbr: "PPB", label: "Própria baliza" },
];

export function tipoGoloLabel(id: string | null | undefined): string | null {
  const t = TIPOS_GOLO.find((x) => x.id === id);
  return t ? t.label : null;
}

/**
 * Superioridade numérica de uma transição (atacantes x defensores) — só faz
 * sentido quando o tipo do golo é "trs" (Transição). Preset com as
 * combinações mais comuns; o picker sempre deixa digitar outra além destas.
 */
export const TRANSICAO_NUMEROS_PRESET: string[] = ["3x0", "3x1", "3x2", "2x0", "2x1", "4x1", "4x2"];

// Zona do campo onde o golo aconteceu — grelha 3×4 do banco.html original
// (1-3 mais perto da baliza, 10-12 mais perto do meio-campo).
export const ZONAS_GOLO: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
