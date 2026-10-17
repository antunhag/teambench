// Testa a invalidação por EXECUÇÃO (não por comparação de ownerId) do
// isolamento da UI de sincronização entre contas.
//
// LIMITAÇÃO DECLARADA: estes testes exercitam `createOutboxSyncController`,
// `reconcileStatus`, `computeStatus` e `neutralStatus` — as funções REAIS
// que `useOutboxSync.ts` exporta e usa internamente (não uma reimplementação
// paralela) — mas não montam o hook `useOutboxSync` em si através de um
// ciclo de vida Preact real (não há harness de renderização de componentes
// em apps/web, ver vitest.config.ts: ambiente "node", sem jsdom). A ligação
// entre o controlador testado aqui e o hook foi verificada por LEITURA do
// código de `useOutboxSync.ts`: o `useEffect` aí cria um
// `createOutboxSyncController(ownerId, supabase, setStatus)` novo sempre
// que `ownerId` muda (dependência `[ownerId]`), guarda-o em `controllerRef`,
// e o `cleanup` desse efeito chama `controller.cancel()` antes de montar o
// próximo — exatamente a sequência que os testes abaixo simulam chamando
// `cancel()`/criando um controlador novo manualmente. Não se declara aqui
// nenhum teste de UI nem do ciclo de vida real do Preact.
import { beforeEach, describe, expect, it } from "vitest";
import { enqueue } from "./outbox";
import {
  computeStatus,
  createOutboxSyncController,
  neutralStatus,
  reconcileStatus,
  type OutboxStatus,
} from "./useOutboxSync";
import { MemoryStorage, createDeferred, createMockClient, item } from "./outboxTestHelpers";

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe("reconcileStatus — requisito 5 (estado neutro durante a transição), função pura", () => {
  it("devolve o snapshot guardado quando pertence ao ownerId atual, e neutro quando não pertence", () => {
    const staleA = computeStatus("ownerA", true);
    expect(reconcileStatus(staleA, "ownerA")).toEqual(staleA);
    expect(reconcileStatus(staleA, "ownerB")).toEqual(neutralStatus("ownerB"));
  });
});

describe("A → B: execução de A invalidada, B publica o seu estado, conclusão tardia de A não o altera", () => {
  it("A. A inicia envio · B. A é invalidada e B torna-se atual · C. estado de B publicado · D. A termina depois · E. nenhuma atualização tardia de A altera o snapshot de B (pending/syncing/corrupted/quarantinedCount/hasLegacyData — tudo publicado atomicamente num único OutboxStatus por chamada)", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    enqueue("ownerB", item({ client_event_id: "b-1" }));

    // Um único sink partilhado — exatamente como o hook real reaproveita o
    // mesmo `setStatus` (useState) entre execuções sucessivas do efeito.
    const statuses: OutboxStatus[] = [];
    const sink = (s: OutboxStatus) => statuses.push(s);

    const upsertA = createDeferred<{ error: unknown }>();
    const controllerA = createOutboxSyncController("ownerA", createMockClient({ upsert: upsertA.promise }), sink);

    // A. A inicia um envio — fica pendurado no upsert (ainda não resolvido).
    const flushAPromise = controllerA.runFlush();
    const afterAStarted = statuses.length;
    expect(statuses[afterAStarted - 1]).toMatchObject({ ownerId: "ownerA", syncing: true });

    // B. Execução de A é invalidada (equivalente ao cleanup do useEffect).
    controllerA.cancel();

    // C. B torna-se o proprietário atual e publica o seu próprio estado,
    // até ao fim (sem nada pendurado).
    const controllerB = createOutboxSyncController("ownerB", createMockClient({}), sink);
    await controllerB.runFlush();
    const lastAfterB = statuses[statuses.length - 1];
    expect(lastAfterB).toMatchObject({ ownerId: "ownerB", syncing: false, pending: 0 });

    const statusesBeforeALateCompletion = statuses.length;

    // D. A termina DEPOIS — resolve o upsert que ficou pendurado.
    upsertA.resolve({ error: null });
    await flushAPromise;

    // E. Nenhuma publicação nova ocorreu: a execução cancelada de A nunca
    // chama onStatus outra vez, logo o último estado publicado continua a
    // ser o de B, intocado — nem pending, nem syncing, nem avisos de A
    // "vazaram" para o snapshot de B.
    expect(statuses.length).toBe(statusesBeforeALateCompletion);
    expect(statuses[statuses.length - 1]).toEqual(lastAfterB);
  });

  it("rejeição tardia de A (promise rejeitada, não só {error}) também não publica nada depois de cancelada", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const statuses: OutboxStatus[] = [];
    const sink = (s: OutboxStatus) => statuses.push(s);

    const upsertA = createDeferred<{ error: unknown }>();
    const controllerA = createOutboxSyncController("ownerA", createMockClient({ upsert: upsertA.promise }), sink);
    const flushAPromise = controllerA.runFlush();

    controllerA.cancel();
    const countAfterCancel = statuses.length;

    // A rejeita DEPOIS de já ter sido cancelada — outboxFlusher.ts já
    // converte isto internamente em {status:"error"} (try/catch), mas o
    // que este teste confirma é que, mesmo assim, o `finally` do
    // controlador não publica nada, porque já estava cancelado.
    upsertA.reject(new Error("falha de rede bruta, tardia"));
    await flushAPromise;

    expect(statuses.length).toBe(countAfterCancel); // nenhuma publicação nova depois do cancel
  });
});

describe("sequência A → B → A: as duas execuções de A são distinguidas (não apenas por ownerId)", () => {
  it("conclusão tardia da PRIMEIRA execução de A não publica, mesmo com uma SEGUNDA execução de A já ativa (mesmo ownerId, controlador diferente)", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const statuses: OutboxStatus[] = [];
    const sink = (s: OutboxStatus) => statuses.push(s);

    const upsertA1 = createDeferred<{ error: unknown }>();
    const controllerA1 = createOutboxSyncController("ownerA", createMockClient({ upsert: upsertA1.promise }), sink);
    const flushA1Promise = controllerA1.runFlush();
    controllerA1.cancel(); // "B torna-se atual"

    const controllerB = createOutboxSyncController("ownerB", createMockClient({}), sink);
    await controllerB.runFlush();
    controllerB.cancel(); // "A torna-se atual outra vez"

    // SEGUNDA execução de A — mesmo ownerId "ownerA" que a primeira, mas um
    // controlador novo e independente.
    const controllerA2 = createOutboxSyncController("ownerA", createMockClient({}), sink);
    await controllerA2.runFlush();
    const lastAfterA2 = statuses[statuses.length - 1];
    expect(lastAfterA2).toMatchObject({ ownerId: "ownerA", syncing: false });
    const countAfterA2 = statuses.length;

    // Só agora a PRIMEIRA execução de A (já cancelada antes de B sequer
    // existir) resolve. Se a invalidação fosse só "ownerId !== ownerId
    // atual", isto não ajudaria a distinguir A1 de A2 (ambas são "ownerA")
    // — é a flag de cancelamento PRÓPRIA de A1 (fechada por closure dentro
    // de createOutboxSyncController) que impede a publicação, não uma
    // comparação de string.
    upsertA1.resolve({ error: null });
    await flushA1Promise;

    expect(statuses.length).toBe(countAfterA2); // nada novo publicado pela A1 tardia
    expect(statuses[statuses.length - 1]).toEqual(lastAfterA2); // o snapshot de A2 continua intocado
  });
});

describe("ausência de publicação e de nova etapa de envio após cleanup", () => {
  it("cancel() antes de qualquer runFlush() impede o início de uma nova etapa de envio", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const statuses: OutboxStatus[] = [];
    const client = createMockClient({});
    const controller = createOutboxSyncController("ownerA", client, (s) => statuses.push(s));

    controller.cancel();
    await controller.runFlush(); // já cancelado — não deve sequer chamar publish(true)

    expect(statuses).toHaveLength(0);
  });
});
