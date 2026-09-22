import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { peekAll, pendingCount, removeByClientEventIds } from "./outbox";

const FLUSH_INTERVAL_MS = 8000;

/**
 * Envia a fila local para o Supabase quando há rede de verdade. Roda em
 * segundo plano, independente de qual tela o treinador está a ver — chamado
 * uma vez no topo da árvore autenticada.
 */
export function useOutboxSync() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  async function flush() {
    const items = peekAll();
    if (items.length === 0) {
      setPending(0);
      return;
    }
    setSyncing(true);
    // navigator.onLine mente em wifi sem internet de verdade — confirma com
    // um pedido real e barato antes de tentar enviar a fila toda.
    const ping = await supabase.from("teams").select("id").limit(1);
    if (ping.error) {
      setSyncing(false);
      setPending(pendingCount());
      return;
    }
    const { error } = await supabase.from("match_events").upsert(items, { onConflict: "client_event_id" });
    if (!error) {
      removeByClientEventIds(items.map((i) => i.client_event_id));
    }
    setSyncing(false);
    setPending(pendingCount());
  }

  useEffect(() => {
    setPending(pendingCount());
    flush();
    const id = setInterval(flush, FLUSH_INTERVAL_MS);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, syncing, flush };
}
