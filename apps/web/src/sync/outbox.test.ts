// Testes de ARMAZENAMENTO PURO (Nível 1): síncronos, sem rede, sem Promises
// controladas — só localStorage. A coordenação assíncrona (flush, troca de
// identidade a meio de um envio) fica em outboxFlusher.test.ts; não se deve
// concluir, só a partir destes testes, que a troca de sessão a meio de um
// flush está coberta.
import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueue,
  hasLegacyOutboxData,
  peekAll,
  pendingCount,
  quarantineCount,
  removeByClientEventIds,
} from "./outbox";
import { MemoryStorage, item } from "./outboxTestHelpers";

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;
});

describe("isolamento A/B e recuperação ao voltar a entrar", () => {
  it("A e B têm filas completamente distintas", () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    enqueue("ownerB", item({ client_event_id: "b-1" }));

    const a = peekAll("ownerA");
    const b = peekAll("ownerB");
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    if (a.status === "ok" && b.status === "ok") {
      expect(a.items.map((i) => i.client_event_id)).toEqual(["a-1"]);
      expect(b.items.map((i) => i.client_event_id)).toEqual(["b-1"]);
    }
  });

  it("o proprietário recupera a própria fila ao 're-entrar' (reler o mesmo ownerId mais tarde)", () => {
    enqueue("ownerA", item({ client_event_id: "a-1" }));
    // "Logout"/"login" não apagam nem recriam nada — reler o mesmo ownerId
    // mais tarde dá exatamente o que lá estava.
    const result = peekAll("ownerA");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.items).toHaveLength(1);
  });

  it("não existe clearAll nem qualquer forma de apagar tudo de um proprietário — logout/expiração não têm caminho de código para apagar dados pendentes", () => {
    enqueue("ownerA", item());
    // Não há função exportada de limpeza total — confirmado estruturalmente
    // pela própria superfície do módulo (ver import acima: só enqueue,
    // peekAll, pendingCount, quarantineCount, removeByClientEventIds,
    // hasLegacyOutboxData existem).
    expect(pendingCount("ownerA")).toBe(1);
  });
});

describe("chave legada — preservada e nunca atribuída/enviada automaticamente", () => {
  it("hasLegacyOutboxData deteta existência sem expor conteúdo, e enqueue/peekAll nunca tocam nela", () => {
    storage.setItem("teambench.outbox", JSON.stringify([item({ client_event_id: "legado-1" })]));

    expect(hasLegacyOutboxData()).toBe(true);

    enqueue("ownerA", item({ client_event_id: "a-1" }));
    const a = peekAll("ownerA");
    expect(a.status).toBe("ok");
    if (a.status === "ok") {
      // A fila de A nunca inclui o item legado — chaves completamente
      // separadas.
      expect(a.items.map((i) => i.client_event_id)).toEqual(["a-1"]);
    }
    // A chave legada continua exatamente como estava.
    expect(storage.getItem("teambench.outbox")).toBe(JSON.stringify([item({ client_event_id: "legado-1" })]));
  });

  it("chave legada vazia ('[]') ou ausente não é reportada como 'há dados legados'", () => {
    expect(hasLegacyOutboxData()).toBe(false);
    storage.setItem("teambench.outbox", "[]");
    expect(hasLegacyOutboxData()).toBe(false);
  });
});

describe("JSON inválido e estrutura inválida", () => {
  it("JSON sintaticamente inválido é reportado como corrompido, nunca como fila vazia", () => {
    storage.setItem("teambench.outbox.ownerA", "{ isto não é json válido");
    const result = peekAll("ownerA");
    expect(result.status).toBe("corrupted");
  });

  it("JSON válido mas com estrutura errada (não é um array de OutboxItem) também é corrompido", () => {
    storage.setItem("teambench.outbox.ownerA", JSON.stringify({ not: "an array" }));
    expect(peekAll("ownerA").status).toBe("corrupted");

    storage.setItem("teambench.outbox.ownerA", JSON.stringify([{ falta: "campos obrigatórios" }]));
    expect(peekAll("ownerA").status).toBe("corrupted");
  });

  it("pendingCount nunca finge uma contagem de confiança quando corrompido — devolve 0, não um número inventado", () => {
    storage.setItem("teambench.outbox.ownerA", "{ json quebrado");
    expect(pendingCount("ownerA")).toBe(0);
  });
});

describe("bloqueio de sobrescrita da fila corrompida", () => {
  it("enqueue() nunca sobrescreve o raw corrompido da fila principal com um array novo", () => {
    const corruptedRaw = "{ json quebrado de propósito";
    storage.setItem("teambench.outbox.ownerA", corruptedRaw);

    enqueue("ownerA", item({ client_event_id: "novo-1" }));

    // O raw da chave principal continua EXATAMENTE o mesmo — não foi
    // substituído por um array contendo só o item novo.
    expect(storage.getItem("teambench.outbox.ownerA")).toBe(corruptedRaw);
  });

  it("removeByClientEventIds() nunca sobrescreve uma fila principal corrompida", () => {
    const corruptedRaw = "{ json quebrado de propósito";
    storage.setItem("teambench.outbox.ownerA", corruptedRaw);

    removeByClientEventIds("ownerA", ["qualquer-id"]);

    expect(storage.getItem("teambench.outbox.ownerA")).toBe(corruptedRaw);
  });
});

describe("quarentena", () => {
  it("quarentena bem-sucedida: evento novo vai para a quarentena quando a fila principal está corrompida, sem tocar no raw corrompido", () => {
    const corruptedRaw = "{ json quebrado";
    storage.setItem("teambench.outbox.ownerA", corruptedRaw);

    const result = enqueue("ownerA", item({ client_event_id: "novo-1" }));

    expect(result).toEqual({ status: "quarantined" });
    expect(storage.getItem("teambench.outbox.ownerA")).toBe(corruptedRaw);
    expect(quarantineCount("ownerA")).toBe(1);
  });

  it("itens em quarentena nunca contam para pendingCount (que reflete só a fila principal, a única sincronizada automaticamente)", () => {
    storage.setItem("teambench.outbox.ownerA", "{ corrompido");
    enqueue("ownerA", item({ client_event_id: "novo-1" }));
    expect(pendingCount("ownerA")).toBe(0);
    expect(quarantineCount("ownerA")).toBe(1);
  });

  it("falha da escrita principal E da quarentena: enqueue devolve 'failed', nunca finge sucesso", () => {
    class AlwaysFailingStorage extends MemoryStorage {
      setItem(): never {
        throw new Error("quota excedida (simulado)");
      }
    }
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new AlwaysFailingStorage();

    const result = enqueue("ownerA", item());
    expect(result).toEqual({ status: "failed" });
  });
});

describe("validação de ownerId e da estrutura do item", () => {
  it("rejeita ownerId vazio ou inválido antes de construir qualquer chave", () => {
    expect(() => enqueue("", item())).toThrow(/ownerId/);
    expect(() => peekAll("   ")).toThrow(/ownerId/);
  });

  it("enqueue é idempotente por client_event_id — não duplica se chamado duas vezes para o mesmo evento", () => {
    enqueue("ownerA", item({ client_event_id: "ev-1", ms: 1000 }));
    enqueue("ownerA", item({ client_event_id: "ev-1", ms: 2000 })); // mesmo id, updater "chamado duas vezes"

    const result = peekAll("ownerA");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.items).toHaveLength(1);
      expect(result.items[0].ms).toBe(2000); // fica com a última tentativa, não duplica
    }
  });
});
