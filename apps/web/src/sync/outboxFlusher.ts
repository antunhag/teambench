// Lógica de envio da fila local para o Supabase — extraída de
// useOutboxSync.ts (que fica só com o wrapper useState/useEffect) para que o
// invariante mais importante deste módulo seja auditável e testável fora de
// um hook React/Preact: um flusher criado para um `ownerId` nunca relê
// "quem está autenticado agora" para decidir a que fila pertence uma
// operação — o `ownerId` fica fechado por closure desde `createOutboxFlusher`,
// para toda a vida da instância, mesmo que a sessão mude enquanto um flush()
// já estiver em voo.
//
// LIMITE CONHECIDO, NÃO RESOLVIDO AQUI: isto garante a CONTABILIDADE LOCAL
// (que fila um item pertence, que fila é limpa após sucesso) — não garante
// qual identidade/JWT efetivamente viaja no pedido HTTP em si. O cliente
// Supabase é uma instância partilhada (ver supabaseClient.ts); se a sessão
// activa nesse cliente mudar no intervalo entre o "ping" e o upsert abaixo,
// é essa sessão corrente que assina o pedido de rede — não necessariamente a
// de quem originou os eventos. Mesmo nesse pior caso, a RLS de match_events
// continua a decidir: ou a conta efetivamente usada tem o papel certo na
// equipa certa (sincroniza, sem registo de autoria — limitação pré-existente,
// não introduzida aqui) ou não tem (RLS rejeita, o item fica preso na fila
// certa, a do dono correto, até sincronizar depois). Em nenhum caso há
// escrita de dados de uma equipa para quem não tem papel nela. Cancelar este
// pedido no cliente, se algum dia for implementado, nunca desfaz uma escrita
// que já tenha chegado ao servidor com sucesso.
import {
  moveToRejected,
  peekAll,
  peekRejected,
  removeByClientEventIds,
  removeRejected,
  updateRejected,
  type OutboxItem,
} from "./outbox";
import { classificarRecusa, detalheDoErro } from "./rejection";

// Superfície mínima do cliente Supabase de que este módulo depende —
// permite injetar um cliente simulado nos testes sem montar o SDK inteiro.
// `status` é o código HTTP da resposta (o PostgrestError não o traz): um 401
// significa pedido sem sessão válida — recusa geral, nunca "sem permissão".
export interface OutboxSupabaseClient {
  from(table: string): {
    select(columns: string): { limit(n: number): PromiseLike<{ error: unknown }> };
    upsert(items: OutboxItem[], opts: { onConflict: string }): PromiseLike<{ error: unknown; status?: number }>;
  };
}

export type FlushResult =
  | { status: "empty" }
  | { status: "offline" }
  | { status: "synced"; count: number }
  // Lote recusado e depois enviado lance a lance (specs/010): `synced` aceites,
  // `rejected` postos de lado como recusados; `interrupted` = uma recusa geral
  // (ou o cancelamento) parou o ciclo e o resto ficou na fila, por enviar.
  | { status: "partial"; synced: number; rejected: number; interrupted: boolean }
  // Lote recusado por um motivo geral (rede, sessão, servidor): nada mudou.
  | { status: "rejected" }
  | { status: "corrupted" }
  | { status: "error" };

export type RetryResult =
  | { status: "empty" }
  | { status: "offline" }
  | { status: "corrupted" }
  | { status: "retried"; accepted: number; stillRejected: number; interrupted: boolean }
  | { status: "error" };

export interface OutboxFlusher {
  flush(): Promise<FlushResult>;
  /** Volta a tentar os recusados, lance a lance (specs/010, research Decisão 4). */
  retryRejected(): Promise<RetryResult>;
}

/** Prazo de cada pedido: um fetch pendurado (wifi de pavilhão meio aberta) conta como recusa geral. */
export const REQUEST_TIMEOUT_MS = 15_000;

type Resposta = { error: unknown; status?: number };

function comPrazo<T extends Resposta>(p: PromiseLike<T>): Promise<Resposta> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<Resposta>((resolve) => {
    timer = setTimeout(() => resolve({ error: { message: "timeout: o servidor não respondeu" } }), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(p), prazo]).finally(() => clearTimeout(timer));
}

/** Junta o código HTTP da resposta ao erro, para a classificação (ver OutboxSupabaseClient). */
function erroComStatus(r: Resposta): unknown {
  return r.error && typeof r.error === "object" && r.status !== undefined ? { ...(r.error as object), status: r.status } : r.error;
}

export function createOutboxFlusher(
  ownerId: string,
  client: OutboxSupabaseClient,
  // O controlador (useOutboxSync) cancela numa troca de conta/saída: o ciclo
  // lance a lance pára antes do pedido seguinte, que já sairia com outra
  // sessão (e receberia "sem permissão" para lances que não o são).
  isCancelled: () => boolean = () => false
): OutboxFlusher {
  const ping = () => comPrazo(client.from("teams").select("id").limit(1));
  const enviar = (items: OutboxItem[]) => comPrazo(client.from("match_events").upsert(items, { onConflict: "client_event_id" }));

  async function flush(): Promise<FlushResult> {
    try {
      const state = peekAll(ownerId);
      if (state.status === "corrupted") {
        // Nunca tenta "limpar" nem reescrever a fila principal corrompida a
        // partir daqui — isso é uma decisão fora do âmbito deste módulo.
        return { status: "corrupted" };
      }
      const items = state.items;
      if (items.length === 0) return { status: "empty" };

      // navigator.onLine mente em wifi sem internet de verdade — confirma com
      // um pedido real e barato antes de tentar enviar a fila toda.
      if ((await ping()).error) return { status: "offline" };

      const r = await enviar(items);
      if (r.error) {
        // Recusa geral: não é culpa de nenhum lance — nada é posto de lado.
        if (classificarRecusa(erroComStatus(r)) === "geral") return { status: "rejected" };
        return await oneByOne(items);
      }

      // Remove só os itens que este flush() concreto enviou — closure sobre
      // `ownerId` garante que isto nunca toca na fila de outro proprietário,
      // mesmo que a sessão corrente, no momento em que esta linha corre, já
      // seja outra.
      removeByClientEventIds(
        ownerId,
        items.map((i) => i.client_event_id)
      );
      return { status: "synced", count: items.length };
    } catch {
      // O cliente real pode, em teoria, rejeitar (lançar) em vez de resolver
      // com um objeto {error} — ex.: falha de rede bruta não capturada pelo
      // SDK. Sem isto, a exceção propagaria como rejeição de promise não
      // tratada e deixaria `syncing` preso a `true` para sempre em
      // useOutboxSync.ts (ver try/finally lá). Nunca sobrescreve nem apaga
      // a fila — items continuam exatamente como estavam.
      return { status: "error" };
    }
  }

  // Lote recusado por um motivo do lance: isola os culpados enviando um a um,
  // pela ordem da fila. Cada aceite sai logo da fila; uma recusa geral (ou o
  // cancelamento) pára e deixa o resto. Os recusados só passam para a lista
  // no fim: se NENHUM lance foi aceite e TODOS foram "sem permissão", é quase
  // de certeza a sessão (pedido anónimo, outra conta) e não os lances —
  // conta como recusa geral e nada é posto de lado (FR-005).
  async function oneByOne(items: OutboxItem[]): Promise<FlushResult> {
    let synced = 0;
    let interrupted = false;
    const recusas: { item: OutboxItem; motivo: Exclude<ReturnType<typeof classificarRecusa>, "geral">; detalhe: string }[] = [];
    for (const it of items) {
      if (isCancelled()) {
        interrupted = true;
        break;
      }
      const r = await enviar([it]);
      if (!r.error) {
        removeByClientEventIds(ownerId, [it.client_event_id]);
        synced++;
        continue;
      }
      const c = classificarRecusa(erroComStatus(r));
      if (c === "geral") {
        interrupted = true;
        break;
      }
      recusas.push({ item: it, motivo: c, detalhe: detalheDoErro(r.error) });
    }
    const pareceSessao = synced === 0 && recusas.length > 0 && recusas.every((x) => x.motivo === "sem_permissao");
    if (pareceSessao) return { status: "rejected" };
    let rejected = 0;
    const agora = Date.now();
    for (const x of recusas) {
      if (moveToRejected(ownerId, { item: x.item, motivo: x.motivo, detalhe: x.detalhe, tentadoEm: agora })) rejected++;
    }
    return { status: "partial", synced, rejected, interrupted };
  }

  async function retryRejected(): Promise<RetryResult> {
    try {
      const state = peekRejected(ownerId);
      if (state.status === "corrupted") return { status: "corrupted" };
      // Os que voltaram a estar na fila principal (falha a meio de uma
      // passagem para recusados) seguem pela fila — saem daqui sem envio.
      const main = peekAll(ownerId);
      if (main.status === "ok" && main.items.length > 0) {
        const naFila = new Set(main.items.map((i) => i.client_event_id));
        const duplicados = state.items.filter((r) => naFila.has(r.item.client_event_id)).map((r) => r.item.client_event_id);
        removeRejected(ownerId, duplicados);
      }
      const after = peekRejected(ownerId);
      if (after.status !== "ok") return { status: "corrupted" };
      if (after.items.length === 0) return { status: "empty" };

      if ((await ping()).error) return { status: "offline" };

      let accepted = 0;
      for (const rec of after.items) {
        if (isCancelled()) return { status: "retried", accepted, stillRejected: after.items.length - accepted, interrupted: true };
        const r = await enviar([rec.item]);
        if (!r.error) {
          removeRejected(ownerId, [rec.item.client_event_id]);
          accepted++;
          continue;
        }
        const c = classificarRecusa(erroComStatus(r));
        if (c === "geral") return { status: "retried", accepted, stillRejected: after.items.length - accepted, interrupted: true };
        updateRejected(ownerId, rec.item.client_event_id, c, detalheDoErro(r.error), Date.now());
      }
      return { status: "retried", accepted, stillRejected: after.items.length - accepted, interrupted: false };
    } catch {
      return { status: "error" };
    }
  }

  return { flush, retryRejected };
}
