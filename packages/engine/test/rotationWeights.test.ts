import { describe, expect, it } from "vitest";
import { defaultWeight } from "../src/rotationWeights";

describe("defaultWeight", () => {
  it("atleta apto: A > B > C > sem classificação", () => {
    expect(defaultWeight("A", "apto")).toBe(5);
    expect(defaultWeight("B", "apto")).toBe(3);
    expect(defaultWeight("C", "apto")).toBe(1);
    expect(defaultWeight(null, "apto")).toBe(1);
  });

  it("a retomar reduz o peso pela metade, arredondado pra baixo", () => {
    expect(defaultWeight("A", "a_retomar")).toBe(2);
    expect(defaultWeight("B", "a_retomar")).toBe(1);
  });

  it("a retomar nunca derruba o peso abaixo de 1", () => {
    expect(defaultWeight("C", "a_retomar")).toBe(1);
    expect(defaultWeight(null, "a_retomar")).toBe(1);
  });
});
