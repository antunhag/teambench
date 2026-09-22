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
