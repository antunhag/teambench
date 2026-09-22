// Tabela de resumo do jogo (minutos, golos, assistências, cartões por atleta)
// e a sua reconstrução para jogos já arquivados.
//
// Porta de buildRows/rebuildHistoryRows do banco.html.
//
// Ponto crítico preservado do original: a identidade de um atleta é sempre o
// seu `id` (imutável), NUNCA o número de camisola (`num`) — dois atletas
// podem legitimamente usar o mesmo número (caso real: dois atletas #30 na
// mesma equipa). `rebuildHistoryRows` só cai para casar por num+nome quando a
// linha arquivada não tem `playerId` gravado (jogos arquivados antes desta
// regra existir) — nesse caso legado, dois atletas com o mesmo número
// arquivados juntos PODEM ser confundidos, o que é uma limitação conhecida e
// aceite, não um bug desta função.
import type { MatchEvent, MatchRow, Player } from "./types";
import { playerSeconds } from "./clock";
import type { ClockAccounting } from "./types";

export interface BuildRowsParams {
  convocados: Player[];
  titularIds: string[];
  events: MatchEvent[];
  clock: ClockAccounting;
  nowMs: number;
}

export function buildRows(params: BuildRowsParams): MatchRow[] {
  const { convocados, titularIds, events, clock, nowMs } = params;
  return convocados.map((p) => {
    const golos = events.filter((e) => e.type === "golo" && e.playerId === p.id).length;
    const assist = events.filter((e) => e.type === "golo" && e.assistId === p.id).length;
    const ca = events.filter((e) => e.type === "cartao_amarelo" && e.playerId === p.id).length;
    const cv = events.filter((e) => e.type === "cartao_vermelho" && e.playerId === p.id).length;
    const min = Math.round(playerSeconds(clock, p.id, nowMs) / 60);
    return {
      playerId: p.id,
      num: p.num,
      nome: p.name,
      convocado: "Sim",
      titular: titularIds.includes(p.id) ? "Sim" : "Não",
      min,
      golos,
      assist,
      ca,
      cv,
    };
  });
}

/**
 * Recalcula golos/assistências/cartões de um jogo arquivado a partir dos seus
 * eventos. Minutos e titularidade NÃO são recalculados aqui (não são
 * recuperáveis com precisão depois de arquivado) — igual ao comportamento
 * original.
 */
export function rebuildHistoryRows(rows: MatchRow[], events: MatchEvent[], roster: Player[]): MatchRow[] {
  return rows.map((r) => {
    const p = r.playerId
      ? roster.find((pp) => pp.id === r.playerId)
      : roster.find((pp) => pp.num === r.num && pp.name === r.nome);
    if (!p) return r;
    return {
      ...r,
      playerId: p.id,
      golos: events.filter((e) => e.type === "golo" && e.playerId === p.id).length,
      assist: events.filter((e) => e.type === "golo" && e.assistId === p.id).length,
      ca: events.filter((e) => e.type === "cartao_amarelo" && e.playerId === p.id).length,
      cv: events.filter((e) => e.type === "cartao_vermelho" && e.playerId === p.id).length,
    };
  });
}
