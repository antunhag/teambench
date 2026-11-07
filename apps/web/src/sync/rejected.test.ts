// specs/010-fila-recusados: um lance recusado não bloqueia os outros; recusa
// geral não põe nada de lado; nada se perde. Sem rede: cliente simulado que
// decide, por lance, se aceita ou recusa (e com que erro).
import { beforeEach, describe, expect, it } from "vitest";
import { enqueue, moveToRejected, peekAll, peekRejected, type OutboxItem } from "./outbox";
import type { OutboxSupabaseClient } from "./outboxFlusher";
import { createOutboxFlusher } from "./outboxFlusher";
import { MemoryStorage, item } from "./outboxTestHelpers";
import { classificarRecusa, textoRecusados } from "./rejection";
import { createOutboxSyncController, REJECTED_RETRY_MS } from "./useOutboxSync";

const GUARDA = { code: "P0001", message: "match_events: UPDATE que muda dado precisa de payload.correcao = true" };
const RLS = { code: "42501", message: 'new row violates row-level security policy for table "match_events"' };
const FK = { code: "23503", message: "insert or update on table violates foreign key constraint" };
const JWT = { code: "PGRST301", message: "JWT expired" };
const REDE = { message: "TypeError: Failed to fetch", code: "" };

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;
});

/** Servidor simulado: `recusa(id)` devolve o erro para esse lance (ou null = aceita). Um lote é recusado se algum lance o for. */
function servidor(recusa: (id: string) => unknown | null, opts: { ping?: unknown } = {}) {
  const aceites: string[] = [];
  const lotes: number[] = [];
  const client: OutboxSupabaseClient = {
    from() {
      return {
        select() {
          return { limit: () => Promise.resolve({ error: opts.ping ?? null }) };
        },
        upsert(items: OutboxItem[]) {
          lotes.push(items.length);
          // Pára no primeiro lance recusado (como o servidor: o lote falha inteiro).
          let erro: unknown = null;
          for (const i of items) {
            erro = recusa(i.client_event_id);
            if (erro) break;
          }
          if (erro) return Promise.resolve({ error: erro });
          aceites.push(...items.map((i) => i.client_event_id));
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, aceites, lotes };
}

function ids(owner: string): string[] {
  const s = peekAll(owner);
  return s.status === "ok" ? s.items.map((i) => i.client_event_id) : ["<corrompida>"];
}
function recusados(owner: string): string[] {
  const s = peekRejected(owner);
  return s.status === "ok" ? s.items.map((r) => r.item.client_event_id) : ["<corrompida>"];
}

describe("classificarRecusa", () => {
  it("geral: rede, sessão, servidor, erro sem código", () => {
    expect(classificarRecusa(REDE)).toBe("geral");
    expect(classificarRecusa(JWT)).toBe("geral");
    expect(classificarRecusa({ message: "x", status: 503 })).toBe("geral");
    expect(classificarRecusa({ message: "RLS rejeitou" })).toBe("geral");
    expect(classificarRecusa(null)).toBe("geral");
  });
  it("do lance: guarda 0026, RLS, FK, outro código SQL", () => {
    expect(classificarRecusa(GUARDA)).toBe("alterado");
    expect(classificarRecusa(RLS)).toBe("sem_permissao");
    expect(classificarRecusa(FK)).toBe("nao_existe");
    expect(classificarRecusa({ code: "23514", message: "check" })).toBe("outro");
  });
});

describe("flush com um lance recusado", () => {
  it("20 pendentes, 1 recusado: 19 chegam ao servidor e saem da fila; o recusado fica guardado (SC-001)", async () => {
    for (let i = 1; i <= 20; i++) enqueue("A", item({ client_event_id: `e${i}` }));
    const srv = servidor((id) => (id === "e7" ? GUARDA : null));
    const r = await createOutboxFlusher("A", srv.client).flush();
    expect(r).toEqual({ status: "partial", synced: 19, rejected: 1, interrupted: false });
    expect(srv.aceites).toHaveLength(19);
    expect(ids("A")).toEqual([]);
    expect(recusados("A")).toEqual(["e7"]);
    const rec = peekRejected("A");
    expect(rec.status === "ok" && rec.items[0].motivo).toBe("alterado");
  });

  it("lances de dois jogos, recusa num deles: o outro jogo sincroniza todo", async () => {
    enqueue("A", item({ client_event_id: "a1", match_id: "jogoA" }));
    enqueue("A", item({ client_event_id: "b1", match_id: "jogoB" }));
    enqueue("A", item({ client_event_id: "b2", match_id: "jogoB" }));
    const srv = servidor((id) => (id === "a1" ? FK : null));
    await createOutboxFlusher("A", srv.client).flush();
    expect(srv.aceites.sort()).toEqual(["b1", "b2"]);
    expect(recusados("A")).toEqual(["a1"]);
  });

  it("depois de posto de lado, os lances novos vão num único envio", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    const srv = servidor((id) => (id === "mau" ? RLS : null));
    const f = createOutboxFlusher("A", srv.client);
    await f.flush();
    enqueue("A", item({ client_event_id: "novo1" }));
    enqueue("A", item({ client_event_id: "novo2" }));
    srv.lotes.length = 0;
    expect(await f.flush()).toEqual({ status: "synced", count: 2 });
    expect(srv.lotes).toEqual([2]);
  });

  it("caso normal: um único envio, sem custo extra (FR-010)", async () => {
    enqueue("A", item({ client_event_id: "x1" }));
    enqueue("A", item({ client_event_id: "x2" }));
    const srv = servidor(() => null);
    expect(await createOutboxFlusher("A", srv.client).flush()).toEqual({ status: "synced", count: 2 });
    expect(srv.lotes).toEqual([2]);
  });
});

describe("recusa geral não põe nada de lado (SC-003)", () => {
  it("sessão expirada no lote: 0 recusados, fila intacta, sem envio lance a lance", async () => {
    enqueue("A", item({ client_event_id: "e1" }));
    enqueue("A", item({ client_event_id: "e2" }));
    const srv = servidor(() => JWT);
    expect(await createOutboxFlusher("A", srv.client).flush()).toEqual({ status: "rejected" });
    expect(ids("A")).toEqual(["e1", "e2"]);
    expect(recusados("A")).toEqual([]);
    expect(srv.lotes).toEqual([2]);
  });

  it("rede cai a meio do envio lance a lance: os aceites saem, o resto fica na fila (não recusado)", async () => {
    for (const id of ["e1", "e2", "mau", "e3", "e4"]) enqueue("A", item({ client_event_id: id }));
    let caiu = false;
    const srv = servidor((id) => {
      if (id === "mau") return GUARDA;
      if (id === "e3" && !caiu) {
        caiu = true;
        return REDE;
      }
      return null;
    });
    const r = await createOutboxFlusher("A", srv.client).flush();
    expect(r).toEqual({ status: "partial", synced: 2, rejected: 1, interrupted: true });
    expect(ids("A")).toEqual(["e3", "e4"]);
    expect(recusados("A")).toEqual(["mau"]);
  });
});

describe("nunca se perde um lance (SC-002)", () => {
  it("lista de recusados ilegível: o lance não sai da fila", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    enqueue("A", item({ client_event_id: "bom" }));
    storage.setItem("teambench.outbox.A.recusados", "{lixo");
    const srv = servidor((id) => (id === "mau" ? GUARDA : null));
    await createOutboxFlusher("A", srv.client).flush();
    expect(ids("A")).toEqual(["mau"]); // continua pendente
    expect(srv.aceites).toEqual(["bom"]);
    expect(storage.getItem("teambench.outbox.A.recusados")).toBe("{lixo"); // nunca sobrescrita
  });

  it("escrita na lista de recusados falha: o lance não sai da fila", () => {
    enqueue("A", item({ client_event_id: "mau" }));
    const original = storage.setItem.bind(storage);
    storage.setItem = (k: string, v: string) => {
      if (k.endsWith(".recusados")) throw new Error("quota");
      original(k, v);
    };
    expect(moveToRejected("A", { item: item({ client_event_id: "mau" }), motivo: "outro", detalhe: "x", tentadoEm: 1 })).toBe(false);
    expect(ids("A")).toEqual(["mau"]);
  });

  it("o recusado guarda exatamente o objeto da fila (nunca recalculado)", async () => {
    const original = item({ client_event_id: "mau", payload: { a: 1, correcao: false } });
    enqueue("A", original);
    await createOutboxFlusher("A", servidor(() => GUARDA).client).flush();
    const rec = peekRejected("A");
    expect(rec.status === "ok" && rec.items[0].item).toEqual(original);
  });

  it("isolado por conta: os recusados de A não aparecem a B", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    await createOutboxFlusher("A", servidor(() => RLS).client).flush();
    expect(recusados("A")).toEqual(["mau"]);
    expect(recusados("B")).toEqual([]);
  });
});

describe("voltar a tentar os recusados", () => {
  it("aceite numa nova tentativa: sai da lista", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    let permissao = false;
    const srv = servidor(() => (permissao ? null : RLS));
    const f = createOutboxFlusher("A", srv.client);
    await f.flush();
    expect(recusados("A")).toEqual(["mau"]);
    permissao = true;
    expect(await f.retryRejected()).toEqual({ status: "retried", accepted: 1, stillRejected: 0, interrupted: false });
    expect(recusados("A")).toEqual([]);
    expect(srv.aceites).toEqual(["mau"]);
  });

  it("continua recusado: atualiza o motivo, não apaga", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    let erro: unknown = RLS;
    const f = createOutboxFlusher("A", servidor(() => erro).client);
    await f.flush();
    erro = FK;
    await f.retryRejected();
    const rec = peekRejected("A");
    expect(rec.status === "ok" && rec.items.map((r) => r.motivo)).toEqual(["nao_existe"]);
  });

  it("sem rede: não toca na lista", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    await createOutboxFlusher("A", servidor(() => GUARDA).client).flush();
    const r = await createOutboxFlusher("A", servidor(() => null, { ping: REDE }).client).retryRejected();
    expect(r).toEqual({ status: "offline" });
    expect(recusados("A")).toEqual(["mau"]);
  });

  it("um recusado que voltou a estar na fila sai da lista sem envio duplicado", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    await createOutboxFlusher("A", servidor(() => GUARDA).client).flush();
    enqueue("A", item({ client_event_id: "mau" })); // ex.: falha a meio de uma passagem
    const srv = servidor(() => null);
    expect(await createOutboxFlusher("A", srv.client).retryRejected()).toEqual({ status: "empty" });
    expect(recusados("A")).toEqual([]);
    expect(ids("A")).toEqual(["mau"]);
  });

  it("controlador: tenta os recusados ao arrancar, depois só a cada 5 min ou com 'Tentar outra vez'", async () => {
    enqueue("A", item({ client_event_id: "mau" }));
    let t = 1_000_000;
    let tentativasDoMau = 0;
    const srv = servidor((id) => {
      if (id === "mau") {
        tentativasDoMau++;
        return GUARDA;
      }
      return null;
    });
    const c = createOutboxSyncController("A", srv.client, () => {}, () => t);
    await c.runFlush(); // lote (1) + lance a lance (2) + nova tentativa ao arrancar (3)
    expect(tentativasDoMau).toBe(3);
    t += 60_000;
    await c.runFlush(); // fila vazia; ainda não passaram 5 min
    expect(tentativasDoMau).toBe(3);
    await c.runFlush({ forceRejected: true }); // "Tentar outra vez"
    expect(tentativasDoMau).toBe(4);
    t += REJECTED_RETRY_MS;
    await c.runFlush();
    expect(tentativasDoMau).toBe(5);
  });
});

describe("textoRecusados (contrato)", () => {
  it("um motivo", () => {
    expect(textoRecusados(1, { alterado: 1 }).titulo).toBe(
      "1 lance não foi aceite pelo servidor: o lance foi corrigido entretanto na Registo. Fica guardado neste aparelho."
    );
    expect(textoRecusados(2, { sem_permissao: 2 }).titulo).toBe(
      "2 lances não foram aceites pelo servidor: a tua conta já não tem permissão nesta equipa. Ficam guardados neste aparelho."
    );
  });
  it("vários motivos, com o detalhe do 'outro'", () => {
    const t = textoRecusados(3, { nao_existe: 2, outro: 1 }, "check [23514]");
    expect(t.titulo).toBe("3 lances não foram aceites pelo servidor. Ficam guardados neste aparelho.");
    expect(t.linhas).toEqual(["2 — o jogo ou o atleta já não existe", "1 — o servidor recusou o lance (detalhe: check [23514])"]);
  });
});
