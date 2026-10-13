// Fila de sincronização — cada evento do jogo entra aqui assim que acontece
// (junto com ser gravado no estado local, que continua sendo a fonte de
// verdade). Guardada em localStorage: sobrevive a fechar/reabrir a app.
//
// INVARIANTE IMPORTANTE: um item, uma vez enfileirado, nunca é recalculado —
// cada retry de flush() (useOutboxSync.ts) reenvia exatamente este mesmo
// objeto, até sincronizar com sucesso e sair daqui. A trigger
// match_events_update_guard (migração 0026) depende disto pra reconhecer um
// reenvio de verdade (dado idêntico ao já gravado); se algum dia este objeto
// passar a ser reconstruído a cada retry (ex.: um campo recalculado na hora),
// o reenvio passaria a ser rejeitado pela trigger — ficaria preso na fila
// pra sempre, em vez de sincronizar.
const KEY = "teambench.outbox";

export interface OutboxItem {
  client_event_id: string;
  match_id: string;
  team_id: string;
  type: string;
  player_id: string | null;
  payload: Record<string, unknown>;
  ms: number | null;
  min: number | null;
  sec: number | null;
  period: number | null;
}

function readAll(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // localStorage cheio/indisponível — o evento já está seguro no estado
    // local do jogo (fonte de verdade); só a sincronização atrasa.
  }
}

export function enqueue(item: OutboxItem) {
  const items = readAll();
  items.push(item);
  writeAll(items);
}

export function peekAll(): OutboxItem[] {
  return readAll();
}

export function removeByClientEventIds(clientEventIds: string[]) {
  if (clientEventIds.length === 0) return;
  const ids = new Set(clientEventIds);
  writeAll(readAll().filter((i) => !ids.has(i.client_event_id)));
}

export function pendingCount(): number {
  return readAll().length;
}
