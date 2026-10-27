// Fila de sincronização — cada evento do jogo entra aqui assim que acontece
// (junto com ser gravado no estado local, que continua sendo a fonte de
// verdade). Guardada em localStorage: sobrevive a fechar/reabrir a app.
//
// INVARIANTE IMPORTANTE: um item, uma vez enfileirado, nunca é recalculado —
// cada retry de flush() (outboxFlusher.ts) reenvia exatamente este mesmo
// objeto, até sincronizar com sucesso e sair daqui. A trigger
// match_events_update_guard (migração 0026) depende disto pra reconhecer um
// reenvio de verdade (dado idêntico ao já gravado); se algum dia este objeto
// passar a ser reconstruído a cada retry (ex.: um campo recalculado na hora),
// o reenvio passaria a ser rejeitado pela trigger — ficaria preso na fila
// pra sempre, em vez de sincronizar.
//
// ISOLAMENTO POR PROPRIETÁRIO: a chave é "teambench.outbox.<ownerId>"
// (ownerId = session.user.id). Cada conta tem a sua própria fila — nenhuma
// função aqui lê sessão nenhuma; quem chama já resolveu a identidade (ver
// outboxFlusher.ts/useOutboxSync.ts/useLiveMatch.ts) e o mesmo valor fica
// fechado por closure do lado de quem chama, nunca relido daqui pra fora.
//
// CHAVE LEGADA: antes deste isolamento existir, a fila vivia numa única
// chave global "teambench.outbox" (sem sufixo). Esse nome NUNCA é lido,
// escrito nem apagado por nenhuma função abaixo — só `hasLegacyOutboxData()`
// confirma a sua EXISTÊNCIA (sem ler conteúdo), para a UI poder avisar sem
// atribuir esses dados a ninguém. Recuperação/exportação/eliminação desse
// conteúdo ficam fora deste lote.
//
// CORRUPÇÃO: um raw que não seja JSON válido, ou que não tenha a forma de
// array de OutboxItem, nunca é tratado como fila vazia nem sobrescrito por
// um enqueue/remove normal (ver OutboxState). Um evento novo que chegue
// enquanto a fila principal está corrompida vai para uma quarentena separada
// por proprietário ("teambench.outbox.<ownerId>.quarantine") — nunca
// sincronizada automaticamente (ver outboxFlusher.ts), nunca apagada aqui.
const LEGACY_KEY = "teambench.outbox";

function mainKey(ownerId: string): string {
  assertValidOwnerId(ownerId);
  return `teambench.outbox.${ownerId}`;
}

function quarantineKey(ownerId: string): string {
  assertValidOwnerId(ownerId);
  return `teambench.outbox.${ownerId}.quarantine`;
}

function assertValidOwnerId(ownerId: string): void {
  if (typeof ownerId !== "string" || ownerId.trim() === "") {
    throw new Error("outbox: ownerId inválido — identidade do proprietário é obrigatória para operar a fila");
  }
}

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

export type OutboxState =
  | { status: "ok"; items: OutboxItem[] }
  | { status: "corrupted" };

export type EnqueueResult =
  | { status: "ok" }
  | { status: "quarantined" }
  | { status: "failed" };

// JSON válido não é necessariamente uma fila válida — confirma a forma
// mínima esperada de cada item antes de confiar no array. Não valida tipos
// profundamente (ex.: o conteúdo de `payload`), só a estrutura que as
// próprias funções deste módulo dependem para operar com segurança.
function isOutboxItem(value: unknown): value is OutboxItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.client_event_id === "string" &&
    typeof v.match_id === "string" &&
    typeof v.team_id === "string" &&
    typeof v.type === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null
  );
}

function isOutboxArray(value: unknown): value is OutboxItem[] {
  return Array.isArray(value) && value.every(isOutboxItem);
}

// Lê uma chave qualquer (principal ou quarentena) de forma tolerante,
// devolvendo um resultado tagged — nunca coalesce corrupção em "vazio".
function readKey(key: string): OutboxState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // localStorage indisponível (modo privado, bloqueio de navegador, etc.)
    // — trata-se como corrupção de leitura, não como fila vazia: quem chama
    // não deve concluir "não há nada pendente" a partir disto.
    return { status: "corrupted" };
  }
  if (raw === null) return { status: "ok", items: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupted" };
  }
  if (!isOutboxArray(parsed)) return { status: "corrupted" };
  return { status: "ok", items: parsed };
}

// Devolve `true` em sucesso. Nunca lança — falha de escrita (quota/
// indisponibilidade) é reportada ao chamador para decidir o que fazer
// (ver enqueue: tenta quarentena antes de desistir).
function writeKey(key: string, items: OutboxItem[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function peekAll(ownerId: string): OutboxState {
  return readKey(mainKey(ownerId));
}

// Conta só o que está confirmado como fila válida — corrupção nunca é
// relatada como "0 pendentes" (isso pareceria sucesso); a UI deve usar
// `peekAll`/o estado de `corrupted` exposto por useOutboxSync para
// distinguir "vazio de propósito" de "não sei, está corrompido".
export function pendingCount(ownerId: string): number {
  const state = peekAll(ownerId);
  return state.status === "ok" ? state.items.length : 0;
}

/** Estado da quarentena tal como está — ilegível é "corrupted", nunca "vazia" (ao contrário de quarantineCount). */
export function peekQuarantine(ownerId: string): OutboxState {
  return readKey(quarantineKey(ownerId));
}

export function quarantineCount(ownerId: string): number {
  const state = readKey(quarantineKey(ownerId));
  return state.status === "ok" ? state.items.length : 0;
}

// Leitura mínima e deliberadamente sem conteúdo: só confirma que a chave
// legada (sem sufixo de proprietário) existe e não está vazia — nunca faz
// JSON.parse dela, nunca mostra o que lá está, nunca a atribui a quem está
// autenticado agora.
export function hasLegacyOutboxData(): boolean {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return false;
  }
  return raw !== null && raw !== "" && raw !== "[]";
}

export function enqueue(ownerId: string, item: OutboxItem): EnqueueResult {
  const key = mainKey(ownerId);
  const main = readKey(key);

  if (main.status === "ok") {
    // Idempotente por client_event_id: se enqueue() for chamado mais de uma
    // vez com o MESMO client_event_id já construído (ex.: o mesmo objeto
    // reenviado), a entrada antiga é substituída, nunca duplicada — nunca
    // manda dois itens com o mesmo client_event_id no mesmo lote de upsert.
    // NÃO protege contra dois eventos DIFERENTES (ids distintos) que
    // representassem a mesma ação lógica duplicada — ex.: se o updater
    // passado a setState em useLiveMatch.ts alguma vez corresse duas vezes
    // para a mesma transição, cada corrida chamaria engine.createEvent()
    // (não determinístico, gera um novo client_event_id a cada chamada) e
    // produziria dois eventos distintos aqui. Isso exigiria mover o efeito
    // colateral de enqueue para fora do corpo do updater — fora do âmbito
    // deste lote (ver useLiveMatch.ts).
    const withoutDuplicate = main.items.filter((i) => i.client_event_id !== item.client_event_id);
    const next = [...withoutDuplicate, item];
    if (writeKey(key, next)) return { status: "ok" };
    // Escrita falhou mesmo com a fila principal íntegra (ex.: quota) — cai
    // para quarentena abaixo, em vez de desistir do evento.
  }

  // Fila principal corrompida OU escrita normal falhou: tenta quarentena —
  // nunca sobrescreve a chave principal (corrompida ou não) com um array
  // novo só para caber o item atual.
  const qKey = quarantineKey(ownerId);
  const quarantine = readKey(qKey);
  const quarantineItems = quarantine.status === "ok" ? quarantine.items : [];
  const quarantineNext = [...quarantineItems.filter((i) => i.client_event_id !== item.client_event_id), item];
  if (writeKey(qKey, quarantineNext)) return { status: "quarantined" };

  // Nem a fila principal nem a quarentena aceitaram o item — isto tem de
  // chegar à UI como falha persistente, nunca como sucesso silencioso.
  return { status: "failed" };
}

// Só opera sobre a fila PRINCIPAL — itens em quarentena nunca são
// confirmados como sincronizados por esta função (a quarentena não entra no
// fluxo de flush automático; ver outboxFlusher.ts).
export function removeByClientEventIds(ownerId: string, clientEventIds: string[]): void {
  if (clientEventIds.length === 0) return;
  const key = mainKey(ownerId);
  const main = readKey(key);
  if (main.status !== "ok") return; // nunca sobrescreve uma fila corrompida
  const ids = new Set(clientEventIds);
  writeKey(key, main.items.filter((i) => !ids.has(i.client_event_id)));
}
