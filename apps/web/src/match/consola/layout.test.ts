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
    expect(pickButtonSize(5 * (64 + 10), "tablet-v")).toBe(64);
    expect(pickButtonSize(5 * (64 + 10) - 1, "tablet-v")).toBe(56);
    expect(pickButtonSize(5 * (56 + 30), "iphone-v")).toBe(56);
  });
  it("nunca desce abaixo de 48, mesmo sem espaço", () => {
    expect(pickButtonSize(0, "iphone-h")).toBe(MIN_BUTTON);
    expect(pickButtonSize(100, "iphone-v")).toBe(MIN_BUTTON);
  });
  it("rowsFit diz quando 48 px também não chega", () => {
    expect(rowsFit(100, "iphone-v", 48)).toBe(false);
    expect(rowsFit(5 * (48 + 30), "iphone-v", 48)).toBe(true);
  });
});
