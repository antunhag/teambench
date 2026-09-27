// Tipo de jogada que originou o golo — mesmas categorias usadas na folha de
// estatísticas em Excel do banco.html original, agrupadas por natureza da
// jogada (jogo aberto / bola parada / situação especial) pra não virar uma
// grelha só de 10 botões sem organização nenhuma na tela.
export interface GoalType {
  id: string;
  abbr: string;
  label: string;
}

export const TIPOS_GOLO_JOGO_ABERTO: GoalType[] = [
  { id: "org", abbr: "ORG", label: "Organização ofensiva" },
  { id: "trs", abbr: "TRS", label: "Transição" },
  { id: "atr", abbr: "ATR", label: "Ataque rápido (erro na saída)" },
];

export const TIPOS_GOLO_BOLA_PARADA: GoalType[] = [
  { id: "cnt", abbr: "CNT", label: "Canto" },
  { id: "lat", abbr: "LAT", label: "Lateral de ataque" },
  { id: "lvr", abbr: "LVR", label: "Livre (frontal/lateral)" },
];

export const TIPOS_GOLO_ESPECIAL: GoalType[] = [
  { id: "pnt", abbr: "PNT", label: "Penálti (6 metros)" },
  { id: "l10", abbr: "L10", label: "Livre direto (10 metros)" },
  { id: "gll", abbr: "GLL", label: "Goleiro-linha (5x4)" },
  { id: "ppb", abbr: "PPB", label: "Própria baliza" },
];

export const TIPOS_GOLO: GoalType[] = [...TIPOS_GOLO_JOGO_ABERTO, ...TIPOS_GOLO_BOLA_PARADA, ...TIPOS_GOLO_ESPECIAL];

export function tipoGoloLabel(id: string | null | undefined): string | null {
  const t = TIPOS_GOLO.find((x) => x.id === id);
  return t ? t.label : null;
}

/**
 * Superioridade numérica de uma transição (atacantes x defensores) — só faz
 * sentido quando o tipo do golo é "trs" (Transição). Preset com as
 * combinações mais comuns; o picker sempre deixa digitar outra além destas.
 * Separado em dois grupos porque nem toda transição é em vantagem — dá pra
 * marcar em igualdade ou até em desvantagem numérica.
 */
export const TRANSICAO_NUMEROS_VANTAGEM: string[] = ["2x0", "2x1", "3x0", "3x1", "3x2", "4x1", "4x2"];
// Sem campo de texto livre por desenho — digitar durante o jogo quebra o
// ritmo de quem está a registar. Só botões fixos; qualquer combinação fora
// desta lista fica pra corrigir depois em "Corrigir registo".
export const TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM: string[] = ["1x1", "2x2", "3x3"];

// Zona do campo onde o golo aconteceu — grelha 3×4 do banco.html original
// (1-3 mais perto da baliza, 10-12 mais perto do meio-campo).
export const ZONAS_GOLO: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
