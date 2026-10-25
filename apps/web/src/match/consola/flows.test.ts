import { describe, expect, it } from "vitest";
import { reconcileSlots, stepFlow, type Flow } from "./flows";

const live = { onCourtCount: 5, preKickoff: false };

describe("stepFlow", () => {
  it("banco com quadra cheia → escolher quem sai → substituição com o tempo do 1º toque", () => {
    const a = stepFlow(null, { type: "bench", inId: "b1", nowMs: 1000 }, live);
    expect(a.flow).toEqual({ kind: "pick-out", inId: "b1", openedAtMs: 1000 });
    const b = stepFlow(a.flow, { type: "out", outId: "p3", nowMs: 5000 }, live);
    expect(b.effect).toEqual({ type: "sub", outId: "p3", inId: "b1", atMs: 1000 });
    expect(b.flow).toBeNull();
  });

  it("⋯ → Substituir → banco", () => {
    const a = stepFlow(null, { type: "out", outId: "p2", nowMs: 200 }, live);
    expect(a.flow).toEqual({ kind: "pick-in", outId: "p2", openedAtMs: 200 });
    const b = stepFlow(a.flow, { type: "bench", inId: "b4", nowMs: 900 }, live);
    expect(b.effect).toEqual({ type: "sub", outId: "p2", inId: "b4", atMs: 200 });
  });

  it("cancelar a meio e tocar no banco começa um fluxo novo, sem consumir a intenção antiga", () => {
    const a = stepFlow(null, { type: "out", outId: "p2", nowMs: 200 }, live);
    const c = stepFlow(a.flow, { type: "cancel" }, live);
    expect(c).toEqual({ flow: null, effect: null });
    const d = stepFlow(c.flow, { type: "bench", inId: "b4", nowMs: 900 }, live);
    expect(d.effect).toBeNull();
    expect(d.flow).toEqual({ kind: "pick-out", inId: "b4", openedAtMs: 900 });
  });

  it("tocar noutro atleta do banco substitui o fluxo, nunca o completa", () => {
    const a = stepFlow(null, { type: "bench", inId: "b1", nowMs: 1 }, live);
    const b = stepFlow(a.flow, { type: "bench", inId: "b2", nowMs: 2 }, live);
    expect(b.effect).toBeNull();
    expect(b.flow).toEqual({ kind: "pick-out", inId: "b2", openedAtMs: 2 });
  });

  it("vaga exige escolha + confirmação", () => {
    const ctx = { onCourtCount: 4, preKickoff: false };
    const a = stepFlow(null, { type: "bench", inId: "b1", nowMs: 1 }, ctx);
    expect(a.flow).toEqual({ kind: "vacancy", inId: "b1" });
    expect(a.effect).toBeNull();
    const b = stepFlow(a.flow, { type: "bench", inId: "b2", nowMs: 2 }, ctx);
    expect(b.flow).toEqual({ kind: "vacancy", inId: "b2" });
    const c = stepFlow(b.flow, { type: "confirm" }, ctx);
    expect(c).toEqual({ flow: null, effect: { type: "enter", inId: "b2" } });
  });

  it("confirmar sem vaga não faz nada", () => {
    const f: Flow = { kind: "vacancy", inId: "b1" };
    expect(stepFlow(f, { type: "confirm" }, live).effect).toBeNull();
  });

  it("antes do apito só ajusta o cinco inicial", () => {
    const ctx = { onCourtCount: 3, preKickoff: true };
    expect(stepFlow(null, { type: "bench", inId: "b1", nowMs: 1 }, ctx).effect).toEqual({ type: "toggleTitular", playerId: "b1" });
    expect(stepFlow(null, { type: "out", outId: "p1", nowMs: 1 }, ctx).effect).toEqual({ type: "toggleTitular", playerId: "p1" });
  });
});

describe("reconcileSlots", () => {
  it("preenche por ordem quando não há histórico", () => {
    expect(reconcileSlots([], ["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("quem entra herda a linha de quem sai (o motor põe-no no fim da lista)", () => {
    const prev = ["a", "b", "c", "d", "e"];
    expect(reconcileSlots(prev, ["a", "b", "d", "e", "x"])).toEqual(["a", "b", "x", "d", "e"]);
  });

  it("vermelho deixa a linha vaga na mesma posição; a reposição volta a essa linha", () => {
    const prev = ["a", "b", "c", "d", "e"];
    const vaga = reconcileSlots(prev, ["a", "c", "d", "e"]);
    expect(vaga).toEqual(["a", null, "c", "d", "e"]);
    expect(reconcileSlots(vaga, ["a", "c", "d", "e", "y"])).toEqual(["a", "y", "c", "d", "e"]);
  });

  it("substituição com uma vaga já aberta não salta para a vaga", () => {
    const prev = ["a", null, "c", "d", "e"];
    expect(reconcileSlots(prev, ["a", "c", "e", "z"])).toEqual(["a", null, "c", "z", "e"]);
  });

  it("desfazer uma substituição devolve a linha", () => {
    const after = reconcileSlots(["a", "b", "c", "d", "e"], ["a", "b", "d", "e", "x"]);
    expect(reconcileSlots(after, ["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("cinco inicial a ser montado antes do apito", () => {
    expect(reconcileSlots([], ["a", "b"])).toEqual(["a", "b", null, null, null]);
    expect(reconcileSlots(["a", "b", null, null, null], ["a", "b", "c"])).toEqual(["a", "b", "c", null, null]);
  });
});
