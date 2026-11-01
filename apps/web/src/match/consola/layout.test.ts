import { describe, expect, it } from "vitest";
import { consolaMode, MIN_BUTTON, pickButtonSize, rowsFit } from "./layout";

describe("consolaMode", () => {
  it("iPhone 16 vertical e horizontal", () => {
    expect(consolaMode(393, 852)).toBe("iphone-v");
    expect(consolaMode(852, 393)).toBe("iphone-h");
  });
  it("Galaxy Tab A11+ (medidas reais no Chrome)", () => {
    expect(consolaMode(800, 1106)).toBe("tablet-v");
    expect(consolaMode(1280, 626)).toBe("tablet-h");
  });
});

describe("pickButtonSize", () => {
  it("escolhe o maior que cabe", () => {
    expect(pickButtonSize(5 * (64 + 20), "tablet-v")).toBe(64);
    expect(pickButtonSize(5 * (64 + 20) - 1, "tablet-v")).toBe(56);
    expect(pickButtonSize(5 * (56 + 12), "iphone-v")).toBe(56);
  });
  it("nunca desce abaixo de 48, mesmo sem espaço", () => {
    expect(pickButtonSize(0, "iphone-h")).toBe(MIN_BUTTON);
    expect(pickButtonSize(100, "iphone-v")).toBe(MIN_BUTTON);
  });
  it("o bloco do nome (até 2 linhas) também conta na altura do cartão", () => {
    // tablet: com botões de 56 px o cartão mede 62 (nome) + 20, não 56 + 20
    expect(pickButtonSize(5 * (56 + 20), "tablet-v")).toBe(48);
    expect(pickButtonSize(5 * (62 + 20), "tablet-v")).toBe(56);
  });
  it("rowsFit diz quando 48 px também não chega", () => {
    expect(rowsFit(100, "iphone-v", 48)).toBe(false);
    expect(rowsFit(5 * (52 + 12), "iphone-v", 48)).toBe(true);
  });
});
