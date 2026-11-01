/**
 * Decisões de layout da Consola (specs/009-captura-detalhada/, research.md
 * Decisão 6) — lógica pura, sem DOM, para poder ser testada em `node`. O
 * componente mede o espaço real depois do render e só pergunta aqui qual o
 * modo e qual o maior botão que cabe; nunca o contrário.
 */

export type ConsolaMode = "iphone-v" | "iphone-h" | "tablet-v" | "tablet-h";

/** Do maior para o menor; 48 px é o mínimo absoluto (FR-023). */
export const BUTTON_SIZES = [64, 56, 48] as const;
export const MIN_BUTTON = 48;

/**
 * Abaixo deste lado menor o aparelho é tratado como telefone. O iPhone 16
 * tem 393 px de lado menor; o Galaxy Tab A11+ tem 800 (medido no aparelho).
 */
const PHONE_MAX_SHORT_SIDE = 600;

export function consolaMode(width: number, height: number): ConsolaMode {
  const phone = Math.min(width, height) < PHONE_MAX_SHORT_SIDE;
  const portrait = height >= width;
  if (phone) return portrait ? "iphone-v" : "iphone-h";
  return portrait ? "tablet-v" : "tablet-h";
}

/**
 * Espaço vertical que cada cartão de jogador ocupa além do próprio botão
 * (Consola v2: o nome fica ao lado das ações em todos os modos). Tem de
 * bater com `.cv-card`/`.cv-players` em theme.css.
 */
export function rowChrome(mode: ConsolaMode): number {
  // padding + borda do cartão (.cv-card) + espaço entre cartões (.cv-players gap)
  if (mode === "iphone-h") return 1 + 1 + 2 + 2;
  if (mode === "iphone-v") return 3 + 3 + 2 + 4;
  return 6 + 6 + 2 + 6;
}

/**
 * Altura mínima do bloco do nome (número, nome em até 2 linhas, posição e
 * minutos): o cartão nunca fica mais baixo do que isto, mesmo com botões
 * menores. Tem de bater com `.cv-who` em theme.css.
 */
export function whoMin(mode: ConsolaMode): number {
  if (mode === "iphone-h") return 40;
  if (mode === "iphone-v") return 52;
  return 62;
}

/**
 * O maior tamanho de botão com que as `rows` linhas cabem em
 * `availableHeight` (altura medida para a lista de jogadores). Se nem com
 * 48 px couberem, devolve 48 na mesma — nunca desce abaixo do mínimo; a
 * lista passa então a precisar de scroll vertical, o que o componente
 * reporta como "não cabe" (SC-005).
 */
export function pickButtonSize(availableHeight: number, mode: ConsolaMode, rows = 5): number {
  for (const size of BUTTON_SIZES) {
    if (rows * (Math.max(size, whoMin(mode)) + rowChrome(mode)) <= availableHeight) return size;
  }
  return MIN_BUTTON;
}

export function rowsFit(availableHeight: number, mode: ConsolaMode, size: number, rows = 5): boolean {
  return rows * (Math.max(size, whoMin(mode)) + rowChrome(mode)) <= availableHeight;
}
