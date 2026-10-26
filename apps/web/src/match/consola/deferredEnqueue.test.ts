import { describe, expect, it } from "vitest";
import { PRAZO_ZONA_MS, resolvePending, startPending, type Pending, type Trigger } from "./deferredEnqueue";

const p: Pending = { key: "ev1", since: 1000 };

describe("resolvePending", () => {
  it.each<Trigger>([{ type: "zona" }, { type: "fechar" }, { type: "outra-acao" }, { type: "desmontar" }, { type: "arranque" }])(
    "%o enfileira o pendente uma vez e limpa",
    (t) => {
      const r = resolvePending(p, t);
      expect(r).toEqual({ enqueueKey: "ev1", next: null });
      // segundo gatilho já não tem nada para enfileirar
      expect(resolvePending(r.next, t)).toEqual({ enqueueKey: null, next: null });
    }
  );

  it("prazo só enfileira depois de passar", () => {
    expect(resolvePending(p, { type: "prazo", now: 1000 + PRAZO_ZONA_MS - 1 })).toEqual({ enqueueKey: null, next: p });
    expect(resolvePending(p, { type: "prazo", now: 1000 + PRAZO_ZONA_MS })).toEqual({ enqueueKey: "ev1", next: null });
  });

  it("desfazer do próprio lance descarta-o sem enfileirar; desfazer de outro mantém-no", () => {
    expect(resolvePending(p, { type: "desfazer", removedKeys: ["ev1"] })).toEqual({ enqueueKey: null, next: null });
    expect(resolvePending(p, { type: "desfazer", removedKeys: ["outro"] })).toEqual({ enqueueKey: null, next: p });
  });

  it("sem pendente não faz nada", () => {
    expect(resolvePending(null, { type: "zona" })).toEqual({ enqueueKey: null, next: null });
  });
});

describe("startPending", () => {
  it("o pendente anterior é enfileirado antes do novo ficar pendente", () => {
    expect(startPending(p, "ev2", 5000)).toEqual({ enqueueKey: "ev1", next: { key: "ev2", since: 5000 } });
    expect(startPending(null, "ev2", 5000)).toEqual({ enqueueKey: null, next: { key: "ev2", since: 5000 } });
  });
});
