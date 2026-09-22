// Porta de POSITIONS/POS_ABBR/normPos/guessPosition do banco.html original.
export const POSITIONS = ["Guarda-Redes", "Fixo", "Ala", "Pivô", "Universal"] as const;
export type Position = (typeof POSITIONS)[number];

export const POS_ABBR: Record<Position, string> = {
  "Guarda-Redes": "GR",
  Fixo: "FX",
  Ala: "AL",
  Pivô: "PV",
  Universal: "UN",
};

export function posAbbr(pos: string | null | undefined): string {
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
