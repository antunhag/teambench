/**
 * Fluxos de substituição/vaga da Consola como máquina de estados pura
 * (specs/009-captura-detalhada/research.md Decisão 7). Um único estado de
 * fluxo de cada vez: começar um fluxo novo substitui o anterior e cancelar
 * volta sempre a `null` sem efeito nenhum — nenhum toque posterior pode
 * consumir uma intenção antiga (bug real encontrado no protótipo).
 *
 * O componente traduz cada `FlowEffect` numa ação de useLiveMatch; este
 * módulo nunca regista nada sozinho.
 */

export type Flow =
  /** Tocou num atleta do banco com a quadra cheia: falta escolher quem sai ("SAI" nas linhas). */
  | { kind: "pick-out"; inId: string; openedAtMs: number }
  /** Escolheu quem sai (⋯ → Substituir): falta escolher quem entra, no banco. */
  | { kind: "pick-in"; outId: string; openedAtMs: number }
  /** Quadra com vaga (ex.: vermelho): reposição só com escolha + confirmação. */
  | { kind: "vacancy"; inId: string }
  | null;

export type FlowEvent =
  | { type: "bench"; inId: string; nowMs: number }
  | { type: "out"; outId: string; nowMs: number }
  | { type: "confirm" }
  | { type: "cancel" };

export type FlowEffect =
  | { type: "sub"; outId: string; inId: string; atMs: number }
  | { type: "enter"; inId: string }
  | { type: "toggleTitular"; playerId: string };

export interface FlowContext {
  onCourtCount: number;
  /** Antes do 1º apito, tocar num atleta só ajusta o cinco inicial (como no "Jogo ao vivo"). */
  preKickoff: boolean;
}

export interface FlowStep {
  flow: Flow;
  effect: FlowEffect | null;
}

export function stepFlow(flow: Flow, ev: FlowEvent, ctx: FlowContext): FlowStep {
  if (ev.type === "cancel") return { flow: null, effect: null };

  if (ctx.preKickoff) {
    if (ev.type === "bench") return { flow: null, effect: { type: "toggleTitular", playerId: ev.inId } };
    if (ev.type === "out") return { flow: null, effect: { type: "toggleTitular", playerId: ev.outId } };
    return { flow: null, effect: null };
  }

  switch (ev.type) {
    case "bench":
      // O tempo gravado é o do 1º toque da sequência (mesma regra do LiveMatch).
      if (flow?.kind === "pick-in") {
        return { flow: null, effect: { type: "sub", outId: flow.outId, inId: ev.inId, atMs: flow.openedAtMs } };
      }
      if (ctx.onCourtCount < 5) return { flow: { kind: "vacancy", inId: ev.inId }, effect: null };
      return { flow: { kind: "pick-out", inId: ev.inId, openedAtMs: ev.nowMs }, effect: null };
    case "out":
      if (flow?.kind === "pick-out") {
        return { flow: null, effect: { type: "sub", outId: ev.outId, inId: flow.inId, atMs: flow.openedAtMs } };
      }
      return { flow: { kind: "pick-in", outId: ev.outId, openedAtMs: ev.nowMs }, effect: null };
    case "confirm":
      if (flow?.kind === "vacancy" && ctx.onCourtCount < 5) {
        return { flow: null, effect: { type: "enter", inId: flow.inId } };
      }
      return { flow, effect: null };
  }
}

/**
 * Posição fixa das 5 linhas. O motor guarda `onCourt` como lista e põe quem
 * entra no fim (`doSub`), por isso a ordem visual vive aqui: quem fica
 * mantém a linha, quem entra ocupa a linha de quem acabou de sair, uma saída
 * sem entrada (vermelho) deixa a linha vaga (`null`) na mesma posição, e uma
 * entrada sem saída preenche a primeira vaga. Funciona igual depois de um
 * "Desfazer", porque só compara o antes e o depois.
 */
export function reconcileSlots(prev: readonly (string | null)[], onCourt: readonly string[], size = 5): (string | null)[] {
  const present = new Set(onCourt);
  const next: (string | null)[] = [];
  const justVacated: number[] = [];
  for (let i = 0; i < Math.max(size, prev.length); i++) {
    const id = prev[i] ?? null;
    if (id && present.has(id)) next.push(id);
    else {
      if (id) justVacated.push(i);
      next.push(null);
    }
  }
  const placed = new Set(next.filter((id): id is string => !!id));
  const incoming = onCourt.filter((id) => !placed.has(id));
  const otherVacant = next.map((id, i) => (id === null && !justVacated.includes(i) ? i : -1)).filter((i) => i >= 0);
  // Quem entra não pode ficar com uma vaga que já existia se houver uma linha
  // acabada de libertar — senão uma substituição saltaria de linha.
  const order = [...justVacated, ...otherVacant];
  for (const id of incoming) {
    const slot = order.shift();
    if (slot === undefined) next.push(id);
    else next[slot] = id;
  }
  // Quadra mais pequena do que o histórico (ex.: tamanho > 5 nunca deve
  // acontecer, mas não perde ninguém) — corta só vagas do fim.
  while (next.length > size && next[next.length - 1] === null) next.pop();
  return next;
}
