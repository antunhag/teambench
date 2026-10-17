// Testes de COORDENAÇÃO ASSÍNCRONA (Nível 2): controlam a ordem de resolução
// de Promises reais com "deferreds" manuais — não fake timers (createOutboxFlusher
// não tem agendamento/retry próprio; o intervalo de 8s vive só em
// useOutboxSync.ts, fora do que se testa aqui). Mock do cliente Supabase
// replica a cadeia encadeada real (.from().select().limit() e
// .from().upsert()), cada uma controlável em separado.
import { beforeEach, describe, expect, it } from "vitest";
import { enqueue, peekAll } from "./outbox";
import { createOutboxFlusher } from "./outboxFlusher";
import { MemoryStorage, createDeferred, createMockClient, item } from "./outboxTestHelpers";

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

describe("resposta atrasada de A não altera a fila de B", () => {
  it("B pode ser criado, alterado e sincronizado por completo antes de A (mais lento) resolver — sem interferência cruzada", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    enqueue("ownerB", item({ client_event_id: "b-1" }));

    const upsertA = createDeferred<{ error: unknown }>();
    const flusherA = createOutboxFlusher("ownerA", createMockClient({ upsert: upsertA.promise }));
    const flushAPromise = flusherA.flush(); // arranca, fica pendurado no upsert

    // Enquanto A ainda não resolveu, B enfileira um evento NOVO e sincroniza
    // por completo.
    enqueue("ownerB", item({ client_event_id: "b-2" }));
    const flusherB = createOutboxFlusher("ownerB", createMockClient({}));
    await flusherB.flush();

    const bAfterOwnFlush = peekAll("ownerB");
    expect(bAfterOwnFlush).toEqual({ status: "ok", items: [] }); // b-1 e b-2 sincronizados

    // Só agora A resolve.
    upsertA.resolve({ error: null });
    const resultA = await flushAPromise;
    expect(resultA).toEqual({ status: "synced", count: 1 });

    // A conclusão tardia de A não reintroduziu nem alterou nada na fila de B.
    expect(peekAll("ownerB")).toEqual({ status: "ok", items: [] });
    expect(peekAll("ownerA")).toEqual({ status: "ok", items: [] });
  });
});

describe("mudança de identidade entre etapas do flush (ping → upsert)", () => {
  it("conclusão de um flush de A, depois de B já estar ativo, só remove da fila de A — nunca usa 'quem está ativo agora' para decidir onde escrever", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));

    const pingA = createDeferred<{ error: unknown }>();
    const flusherA = createOutboxFlusher("ownerA", createMockClient({ ping: pingA.promise }));
    const flushAPromise = flusherA.flush(); // parado logo no primeiro await (o "ping")

    // "B faz login" entretanto — representado aqui só por B existir e ter a
    // sua própria fila operada de forma totalmente independente, nenhuma
    // relação com a instância de A.
    enqueue("ownerB", item({ client_event_id: "b-1" }));

    // Só agora o "ping" de A responde, e o upsert (resolvido por omissão no
    // mock) deixa A terminar.
    pingA.resolve({ error: null });
    const resultA = await flushAPromise;

    expect(resultA).toEqual({ status: "synced", count: 1 });
    expect(peekAll("ownerA")).toEqual({ status: "ok", items: [] }); // só a fila de A foi tocada
    const b = peekAll("ownerB");
    expect(b.status).toBe("ok");
    if (b.status === "ok") expect(b.items.map((i) => i.client_event_id)).toEqual(["b-1"]); // B intocado
  });
});

describe("falha de envio preserva os dados", () => {
  it("upsert devolve erro: flush() devolve 'rejected' e o item continua na fila, não é removido", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const flusher = createOutboxFlusher(
      "ownerA",
      createMockClient({ upsert: Promise.resolve({ error: { message: "RLS rejeitou" } }) })
    );

    const result = await flusher.flush();
    expect(result).toEqual({ status: "rejected" });

    const state = peekAll("ownerA");
    expect(state.status).toBe("ok");
    if (state.status === "ok") expect(state.items).toHaveLength(1);
  });

  it("sem rede (ping falha): flush() devolve 'offline' sem sequer tentar o upsert, item preservado", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const flusher = createOutboxFlusher("ownerA", createMockClient({ ping: Promise.resolve({ error: "sem rede" }) }));

    const result = await flusher.flush();
    expect(result).toEqual({ status: "offline" });
    expect(peekAll("ownerA")).toEqual({ status: "ok", items: [item({ client_event_id: "a-1" })] });
  });

  it("fila principal corrompida: flush() devolve 'corrupted' sem tentar nenhum pedido de rede", async () => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem(
      "teambench.outbox.ownerA",
      "{ corrompido"
    );
    const flusher = createOutboxFlusher("ownerA", createMockClient({}));
    const result = await flusher.flush();
    expect(result).toEqual({ status: "corrupted" });
  });

  it("cliente que REJEITA (lança) em vez de resolver com {error}: flush() devolve 'error' tageado, nunca propaga a exceção, item preservado", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const flusher = createOutboxFlusher("ownerA", createMockClient({ upsert: Promise.reject(new Error("falha de rede bruta")) }));

    const result = await flusher.flush();
    expect(result).toEqual({ status: "error" });

    const state = peekAll("ownerA");
    expect(state.status).toBe("ok");
    if (state.status === "ok") expect(state.items).toHaveLength(1);
  });
});

describe("flushes sobrepostos do MESMO proprietário — caracterização, NÃO corrigido neste lote", () => {
  it("duas chamadas de flush() em paralelo do mesmo owner podem ambas ler a mesma fila e só a segunda remoção prevalece (comportamento atual, dívida conhecida — ver código de revisão, não requisito das 8 regras deste lote)", async () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));

    const upsert1 = createDeferred<{ error: unknown }>();
    const upsert2 = createDeferred<{ error: unknown }>();
    const flusher = createOutboxFlusher("ownerA", createMockClient({})); // client fixo; swap manual abaixo

    // Duas invocações "simultâneas" de flush(), cada uma com o seu próprio
    // cliente mock (simula duas chamadas reais do mesmo intervalo/evento
    // "online" a sobreporem-se) — propositadamente não resolvido por este
    // lote (reentrância é ortogonal ao isolamento entre contas).
    const flusherX = createOutboxFlusher("ownerA", createMockClient({ upsert: upsert1.promise }));
    const flusherY = createOutboxFlusher("ownerA", createMockClient({ upsert: upsert2.promise }));
    void flusher; // só para deixar claro que não se usa o flusher "principal" aqui

    const px = flusherX.flush();
    const py = flusherY.flush();

    upsert1.resolve({ error: null });
    upsert2.resolve({ error: null });
    await Promise.all([px, py]);

    // Ambas terminam "com sucesso" sobre o mesmo item — não há proteção de
    // reentrância hoje (nem antes deste lote). Isto é uma CARACTERIZAÇÃO:
    // o resultado final (fila vazia) não prova ausência de condição de
    // corrida em casos mais complexos (ex.: um enqueue novo a meio).
    expect(peekAll("ownerA")).toEqual({ status: "ok", items: [] });
  });
});
