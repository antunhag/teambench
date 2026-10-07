import { useState } from "preact/hooks";
import type { ScreenId } from "@teambench/engine";

export type { ScreenId };

const STORAGE_KEY = "teambench.activeScreen";
const VALID_SCREENS: ScreenId[] = ["calendar", "roster", "match-formats", "team-members"];

function readStored(): ScreenId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && (VALID_SCREENS as string[]).includes(raw) ? (raw as ScreenId) : null;
  } catch {
    return null;
  }
}

/**
 * Qual ecrã está ativo agora — sobrevive a recarregar a página (F5), por
 * aparelho, via localStorage (FR-008). Não é um router: não muda a URL da
 * app nem permite link direto para um ecrã específico (decisão aceite na
 * clarificação da spec 002-multi-team-navigation).
 */
export function useActiveScreen(defaultScreen: ScreenId) {
  const [activeScreen, setActiveScreenState] = useState<ScreenId>(() => readStored() ?? defaultScreen);

  function setActiveScreen(screen: ScreenId) {
    setActiveScreenState(screen);
    try {
      localStorage.setItem(STORAGE_KEY, screen);
    } catch {
      // localStorage indisponível — a troca de ecrã ainda funciona nesta sessão, só não sobrevive a um F5.
    }
  }

  return { activeScreen, setActiveScreen };
}
