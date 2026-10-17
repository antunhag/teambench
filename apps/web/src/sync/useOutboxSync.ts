import { useEffect, useRef, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { hasLegacyOutboxData, peekAll, pendingCount, quarantineCount } from "./outbox";
import { createOutboxFlusher, type OutboxSupabaseClient } from "./outboxFlusher";

const FLUSH_INTERVAL_MS = 8000;

// Snapshot do estado de sincronização, SEMPRE etiquetado com o `ownerId` a
// que pertence — nunca um conjunto solto de useState independentes (ver
// reconcileStatus abaixo e o porquê disso).
export interface OutboxStatus {
  ownerId: string;
  pending: number;
  syncing: boolean;
  corrupted: boolean;
  quarantinedCount: number;
  hasLegacyData: boolean;
}

export function neutralStatus(ownerId: string): OutboxStatus {
  return { ownerId, pending: 0, syncing: false, corrupted: false, quarantinedCount: 0, hasLegacyData: false };
}

export function computeStatus(ownerId: string, syncing: boolean): OutboxStatus {
  const state = peekAll(ownerId);
  return {
    ownerId,
    pending: pendingCount(ownerId),
    syncing,
    corrupted: state.status === "corrupted",
    quarantinedCount: quarantineCount(ownerId),
    hasLegacyData: hasLegacyOutboxData(),
  };
}

// Requisito 5: no render do proprietário NOVO, nunca devolve o snapshot do
// proprietário ANTERIOR como se fosse o atual — devolve neutro até a nova
// execução publicar o seu próprio (via createOutboxSyncController abaixo).
// É uma função pura, sem Preact, para poder ser testada diretamente.
export function reconcileStatus(status: OutboxStatus, ownerId: string): OutboxStatus {
  return status.ownerId === ownerId ? status : neutralStatus(ownerId);
}

export interface OutboxSyncController {
  /** Invalida esta execução: nenhuma publicação de estado nem nova etapa de
   *  envio a partir daqui, mesmo que um flush() já em voo ainda resolva. */
  cancel(): void;
  runFlush(): Promise<void>;
}

// Controlador de UMA execução do efeito, isolado do Preact — é o que
// useOutboxSync() usa internamente (ver abaixo) e também o que
// useOutboxSync.test.ts exercita diretamente. A invalidação é por EXECUÇÃO
// (uma flag local fechada por closure nesta chamada de
// createOutboxSyncController), não por comparação de `ownerId` — numa
// sequência A → B → A, as duas execuções de A têm cada uma o seu próprio
// controlador e a sua própria flag `cancelled`, nunca confundidas entre si
// só por partilharem o mesmo `ownerId`.
//
// Requisito 7, mantido explícito: `cancel()` só impede este controlador de
// PUBLICAR estado ou iniciar uma NOVA etapa de envio — nunca desfaz um
// upsert que já tenha chegado e tido sucesso no servidor. Se o `flush()`
// já em voo no momento do cancel() completar com sucesso no servidor, essa
// escrita fica feita; só a contabilidade local (ver outboxFlusher.ts,
// inalterado) e a publicação de estado é que respeitam o cancelamento.
export function createOutboxSyncController(
  ownerId: string,
  client: OutboxSupabaseClient,
  onStatus: (status: OutboxStatus) => void
): OutboxSyncController {
  let cancelled = false;
  const flusher = createOutboxFlusher(ownerId, client);

  function publish(syncing: boolean) {
    if (cancelled) return; // requisito 3: nunca publica depois de invalidada
    onStatus(computeStatus(ownerId, syncing));
  }

  async function runFlush(): Promise<void> {
    if (cancelled) return; // requisito 3: nunca inicia nova etapa já invalidada
    publish(true);
    try {
      await flusher.flush();
    } finally {
      // Mesmo que cancelada ENQUANTO este flush() estava em voo, publish()
      // acima já verifica `cancelled` de novo — cobre também o caminho de
      // erro (flusher.flush() já trata exceções internamente, mas este
      // finally garante a publicação final em qualquer caso, sujeita à
      // mesma verificação).
      publish(false);
    }
  }

  return {
    cancel() {
      cancelled = true; // requisito 2: invalida esta execução especificamente
    },
    runFlush,
  };
}

/**
 * Envia a fila local do PROPRIETÁRIO `ownerId` para o Supabase quando há
 * rede de verdade. Roda em segundo plano, independente de qual tela o
 * treinador está a ver — chamado uma vez no topo da árvore autenticada, com
 * `ownerId = session.user.id`.
 *
 * O efeito depende de `[ownerId]`, não de `[]`: isto importa porque a árvore
 * de componentes nem sempre desmonta numa troca de sessão — o supabase-js
 * propaga sessão entre separadores da mesma origem via localStorage/evento
 * `storage`, o que pode entregar uma sessão nova sem passar por um estado
 * nulo intermédio.
 *
 * Cada execução do efeito cria o seu PRÓPRIO `OutboxSyncController` (ver
 * acima), com a sua própria flag de cancelamento — não apenas uma
 * comparação de `ownerId` (que falharia numa sequência A → B → A: a
 * segunda execução de A tem de se distinguir da primeira, mesmo com o
 * mesmo `ownerId`). O `cleanup` do efeito chama `cancel()` nessa execução
 * específica, além de limpar o temporizador/listener — uma execução já
 * cancelada nunca publica pending/corrupted/quarantinedCount/avisos
 * antigos nem altera `syncing`, e nunca inicia uma nova etapa de envio que
 * ainda não tivesse começado.
 *
 * `reconcileStatus` cobre a lacuna de um render: entre o `ownerId` mudar e
 * a nova execução publicar o seu próprio snapshot, o hook devolve um
 * estado NEUTRO para o novo `ownerId` em vez de continuar a mostrar o
 * snapshot do proprietário anterior.
 */
export function useOutboxSync(ownerId: string) {
  const [status, setStatus] = useState<OutboxStatus>(() => computeStatus(ownerId, false));
  const controllerRef = useRef<OutboxSyncController | null>(null);

  useEffect(() => {
    const controller = createOutboxSyncController(ownerId, supabase, setStatus);
    controllerRef.current = controller;

    // Não publica um snapshot inicial aqui separadamente: controller.runFlush()
    // já chama publish(true) de forma síncrona antes de qualquer await — esse
    // é o primeiro estado observável (nenhum render ocorre entre os dois).
    controller.runFlush();
    const id = setInterval(() => controller.runFlush(), FLUSH_INTERVAL_MS);
    const onOnline = () => controller.runFlush();
    window.addEventListener("online", onOnline);
    return () => {
      controller.cancel();
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  const effective = reconcileStatus(status, ownerId);

  return {
    pending: effective.pending,
    syncing: effective.syncing,
    corrupted: effective.corrupted,
    quarantinedCount: effective.quarantinedCount,
    hasLegacyData: effective.hasLegacyData,
    // Função pública de sincronização manual (sem chamador hoje em
    // apps/web/src, mas faz parte da API do hook): delega sempre ao
    // controlador da execução ATUAL — se `ownerId` mudar antes de resolver,
    // esse controlador já terá sido cancelado e o próprio `runFlush`/
    // `publish` internos tornam-se no-op, pelas mesmas regras acima.
    flush: async () => {
      await controllerRef.current?.runFlush();
    },
  };
}
