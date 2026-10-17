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
import { peekAll, removeByClientEventIds, type OutboxItem } from "./outbox";

// Superfície mínima do cliente Supabase de que este módulo depende —
// permite injetar um cliente simulado nos testes sem montar o SDK inteiro.
export interface OutboxSupabaseClient {
  from(table: string): {
    select(columns: string): { limit(n: number): PromiseLike<{ error: unknown }> };
    upsert(items: OutboxItem[], opts: { onConflict: string }): PromiseLike<{ error: unknown }>;
  };
}

export type FlushResult =
  | { status: "empty" }
  | { status: "offline" }
  | { status: "synced"; count: number }
  | { status: "rejected" }
  | { status: "corrupted" }
  | { status: "error" };

export interface OutboxFlusher {
  flush(): Promise<FlushResult>;
}

export function createOutboxFlusher(ownerId: string, client: OutboxSupabaseClient): OutboxFlusher {
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
      const ping = await client.from("teams").select("id").limit(1);
      if (ping.error) return { status: "offline" };

      const { error } = await client.from("match_events").upsert(items, { onConflict: "client_event_id" });
      if (error) return { status: "rejected" };

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

  return { flush };
}
