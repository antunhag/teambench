// Lógica pura de quais ecrãs um papel pode ver na navegação — ver
// specs/002-multi-team-navigation/data-model.md (entidade NavItem) e
// Decisão 4/6 do research.md: esconder completamente o que o papel não
// permite (nunca mostrar desabilitado), numa lista plana agrupada por
// "jogo"/"gestao" (sem menu em duas camadas).
//
// Esta lista é a única fonte de verdade de "que papel mínimo cada ecrã
// precisa" — apps/web/src/Nav.tsx só chama visibleNavItems, nunca decide
// isto sozinho. O servidor (RLS) continua a ser a proteção de verdade
// (FR-006) — esconder um item aqui é só apresentação.

export type Role = "viewer" | "data_entry" | "team_admin";

export type NavGroup = "jogo" | "gestao";

/** Único sítio onde os ids de ecrã existem — apps/web/src/useActiveScreen.ts reaproveita este tipo, nunca duplica a lista. */
export type ScreenId = "calendar" | "roster" | "match-formats" | "team-members";

export interface NavItem {
  id: ScreenId;
  label: string;
  group: NavGroup;
  minRole: Role;
}

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  data_entry: 1,
  team_admin: 2,
};

export const NAV_ITEMS: NavItem[] = [
  { id: "calendar", label: "Calendário", group: "jogo", minRole: "viewer" },
  { id: "roster", label: "Plantel", group: "gestao", minRole: "viewer" },
  { id: "match-formats", label: "Formato de Jogo", group: "gestao", minRole: "viewer" },
  { id: "team-members", label: "Acesso à Equipa", group: "gestao", minRole: "team_admin" },
];

/** Só os itens cujo papel mínimo o `role` atual cumpre — nunca os outros, nem desabilitados. */
export function visibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => ROLE_RANK[role] >= ROLE_RANK[item.minRole]);
}
