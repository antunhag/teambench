// Anulações e categorias de equipa (specs/009-captura-detalhada/, research
// Decisão 4). O "−" de uma categoria nunca apaga nem altera o evento
// original — regista um evento "anulacao" com `alvoId`. Tudo o que conta
// (placar, contadores, resumos) passa por `eventosEfetivos`, que tira as
// anulações e os eventos anulados; a lista bruta continua a ser a fonte de
// verdade sincronizada.
import type { MatchEvent, Zona3 } from "./types";

export const TIPOS_ANULAVEIS: readonly MatchEvent["type"][] = ["transicao", "golo_sofrido", "remate_adv", "defesa", "perda", "recuperacao"];

export type CategoriaEquipa =
  | "transicao_favor"
  | "transicao_contra"
  | "golo_sofrido"
  | "remate_adv_defendido"
  | "remate_adv_fora"
  | "remate_adv_bloqueado"
  | `perda_${Zona3}`
  | `recuperacao_${Zona3}`;

export function eventKey(e: MatchEvent): string {
  return e.clientEventId ?? e.id;
}

/** Ativo = não anulado por nenhuma anulação ativa (anular uma anulação reativa o original). */
function activeChecker(events: MatchEvent[]): (e: MatchEvent) => boolean {
  const annulers = new Map<string, MatchEvent[]>();
  for (const e of events) {
    if (e.type !== "anulacao" || !e.alvoId) continue;
    const list = annulers.get(e.alvoId) ?? [];
    list.push(e);
    annulers.set(e.alvoId, list);
  }
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const isActive = (e: MatchEvent): boolean => {
    const k = eventKey(e);
    const cached = memo.get(k);
    if (cached !== undefined) return cached;
    // Ciclo (nunca devia acontecer: uma anulação só aponta para trás) — trata como ativo.
    if (visiting.has(k)) return true;
    visiting.add(k);
    const active = !(annulers.get(k) ?? []).some(isActive);
    visiting.delete(k);
    memo.set(k, active);
    return active;
  };
  return isActive;
}

export function eventosEfetivos(events: MatchEvent[]): MatchEvent[] {
  if (!events.some((e) => e.type === "anulacao")) return events;
  const isActive = activeChecker(events);
  return events.filter((e) => e.type !== "anulacao" && isActive(e));
}

export function naCategoria(e: MatchEvent, c: CategoriaEquipa): boolean {
  switch (c) {
    case "transicao_favor":
      return e.type === "transicao" && e.dir === "ofensiva";
    case "transicao_contra":
      return e.type === "transicao" && e.dir === "defensiva";
    case "golo_sofrido":
      return e.type === "golo_sofrido";
    case "remate_adv_defendido":
      return e.type === "defesa";
    case "remate_adv_fora":
      return e.type === "remate_adv" && e.desfecho === "fora";
    case "remate_adv_bloqueado":
      return e.type === "remate_adv" && e.desfecho === "bloqueado";
    default: {
      const [tipo, zona3] = c.split("_") as ["perda" | "recuperacao", Zona3];
      return e.type === tipo && e.zona3 === zona3;
    }
  }
}

/** O evento que o "−" da categoria anularia agora (o último ainda efetivo), ou null. */
export function ultimoDaCategoria(events: MatchEvent[], c: CategoriaEquipa): MatchEvent | null {
  const efetivos = eventosEfetivos(events);
  for (let i = efetivos.length - 1; i >= 0; i--) if (naCategoria(efetivos[i], c)) return efetivos[i];
  return null;
}

/** Contagem "parte atual · total" de uma categoria, já sem anulados. */
export function contarCategoria(events: MatchEvent[], c: CategoriaEquipa, period: number): { period: number; total: number } {
  const daCategoria = eventosEfetivos(events).filter((e) => naCategoria(e, c));
  return { period: daCategoria.filter((e) => e.period === period).length, total: daCategoria.length };
}

/**
 * Um `alvoId` só é válido se apontar para um evento do mesmo jogo (da mesma
 * lista), de uma categoria de equipa e ainda efetivo — ou para uma anulação
 * ativa (é assim que se desfaz um "−" que já foi enviado).
 */
export function podeAnular(events: MatchEvent[], alvoId: string): boolean {
  const alvo = events.find((e) => eventKey(e) === alvoId);
  if (!alvo) return false;
  const isActive = activeChecker(events);
  if (!isActive(alvo)) return false;
  return TIPOS_ANULAVEIS.includes(alvo.type) || alvo.type === "anulacao";
}
