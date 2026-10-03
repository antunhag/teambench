// Porta de POSITIONS/POS_ABBR/normPos/guessPosition do banco.html original.
// "Ala" (genérica) foi substituída por "Ala Esquerda"/"Ala Direita" — no
// futsal o atleta joga do lado oposto ao pé dominante, pra poder cortar pra
// dentro e rematar, então o lado importa pra quem monta o plano de rotação
// (ver packages/engine/src/rotationPlan.ts). Atletas com o valor antigo
// "Ala" salvo no banco (de antes dessa mudança) continuam aparecendo —
// tratados à parte abaixo — até alguém reclassificar cada um pelo Plantel.
export const POSITIONS = ["Guarda-Redes", "Fixo", "Ala Esquerda", "Ala Direita", "Pivô", "Universal"] as const;
export type Position = (typeof POSITIONS)[number];

export const POS_ABBR: Record<Position, string> = {
  "Guarda-Redes": "GR",
  Fixo: "FX",
  "Ala Esquerda": "AE",
  "Ala Direita": "AD",
  Pivô: "PV",
  Universal: "UN",
};

/** Valor legado (de antes da divisão Esquerda/Direita) — ainda pode estar salvo em atletas antigos. */
export const LEGACY_ALA = "Ala";

/** `pos` não tipa mais como `"Ala"` (não faz mais parte de `Position`), mas o banco pode ter guardado o valor antigo — esta checagem usa `string` solto de propósito, pra não dar erro de tipo numa comparação que é sobre dado em runtime, não sobre o union atual. */
export function isLegacyAla(pos: string | null | undefined): boolean {
  return pos === LEGACY_ALA;
}

export function posAbbr(pos: string | null | undefined): string {
  if (pos === LEGACY_ALA) return "AL?"; // sinaliza que falta reclassificar — ver LEGACY_ALA
  return (pos && POS_ABBR[pos as Position]) || "UN";
}

export function isGoalkeeper(pos: string | null | undefined): boolean {
  return pos === "Guarda-Redes";
}

/** Cor de destaque do guarda-redes — mesma do banco.html original, pra reconhecer de relance. */
export const GOALKEEPER_COLOR = "#2D6FE0";

function normPos(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

const POS_NORM_MAP: Record<string, Position> = (() => {
  const m: Record<string, Position> = {};
  POSITIONS.forEach((p) => {
    m[normPos(p)] = p;
  });
  (Object.keys(POS_ABBR) as Position[]).forEach((full) => {
    m[normPos(POS_ABBR[full])] = full;
  });
  m[normPos("Guarda Redes")] = "Guarda-Redes";
  m[normPos("Guardaredes")] = "Guarda-Redes";
  m[normPos("Goleiro")] = "Guarda-Redes";
  m[normPos("Pivo")] = "Pivô";
  m[normPos("Esquerda")] = "Ala Esquerda";
  m[normPos("Ala Esq")] = "Ala Esquerda";
  m[normPos("Direita")] = "Ala Direita";
  m[normPos("Ala Dir")] = "Ala Direita";
  // "Ala" sozinha (sem lado) NÃO entra aqui de propósito — não dá pra
  // adivinhar o lado a partir só disso, então cai no fallback "Universal"
  // de guessPosition() em vez de uma reclassificação errada.
  return m;
})();

/** Tenta reconhecer a posição a partir dos campos restantes de uma linha importada (colunas depois de nº/nome). */
export function guessPosition(fields: string[]): Position {
  for (let i = 2; i < fields.length; i++) {
    const np = normPos(fields[i]);
    if (POS_NORM_MAP[np]) return POS_NORM_MAP[np];
  }
  return "Universal";
}
