// Sugestão de escalação por vaga — mescla aptidão + estado do atleta +
// minutos recentes (specs/003-data-driven-rotation/). "Jogam os melhores":
// aptidão é o fator dominante, o estado só afasta o indisponível pro fim da
// lista, e minutos recentes NUNCA entram na ordenação — só compõem o motivo
// exibido (FR-006, Decisão em data-model.md).
import type { AptitudeBySlot, AptitudeQuality, RotationSlotType } from "./rotationPlan";
import type { RecentMinutes } from "./recentMinutes";
import type { Player } from "./types";

export type AvailabilityStatus = "apto" | "a_retomar" | "indisponivel";

export interface RotationSuggestion {
  playerId: string;
  quality: AptitudeQuality | null;
  availabilityStatus: AvailabilityStatus;
  recentMinutes: RecentMinutes | null;
  reason: string;
}

function qualityRank(q: AptitudeQuality | null | undefined): number {
  return q ? { A: 0, B: 1, C: 2 }[q] : 3;
}

/** `indisponivel` sempre por último, nunca sugerido primeiro (FR-001/FR-002) — `a_retomar` não afeta a ordem, só o `reason`. */
function availabilityRank(status: AvailabilityStatus): number {
  return status === "indisponivel" ? 1 : 0;
}

/** Frase curta em português combinando aptidão + estado + contexto de minutos — nunca usada pra decidir a ordem, só pra explicar. */
export function explainSuggestion(
  quality: AptitudeQuality | null,
  availabilityStatus: AvailabilityStatus,
  recentMinutes: RecentMinutes | null
): string {
  const parts: string[] = [quality ? `${quality} na vaga` : "Sem classificação nesta vaga"];

  if (availabilityStatus === "indisponivel") parts.push("indisponível");
  else if (availabilityStatus === "a_retomar") parts.push("a retomar, dosear entrada");

  if (recentMinutes && recentMinutes.gamesCounted > 0) {
    const avgMin = Math.round(recentMinutes.totalMs / recentMinutes.gamesCounted / 60_000);
    parts.push(`média de ${avgMin} min nos últimos ${recentMinutes.gamesCounted} jogos`);
  } else {
    parts.push("sem jogos recentes registados");
  }

  return parts.join(" · ");
}

/**
 * Ordem sugerida de atletas pra uma vaga: primeiro por `availabilityStatus`
 * (indisponível por último), depois por `quality` (A > B > C > sem
 * classificação). Um atleta sem nenhuma linha de aptidão pra essa vaga
 * (não é vaga habitual) cai na mesma posição de "sem classificação" — a
 * ausência de minutos recentes nunca move ninguém (FR-006).
 */
export function suggestOrder(
  players: Player[],
  aptitudesBySlot: Record<string, AptitudeBySlot>,
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  recentMinutesByPlayer: Record<string, RecentMinutes>,
  slot: RotationSlotType
): RotationSuggestion[] {
  const suggestions: RotationSuggestion[] = players.map((p) => {
    const quality = aptitudesBySlot[p.id]?.[slot] ?? null;
    const availabilityStatus = availabilityByPlayer[p.id] ?? "apto";
    const recentMinutes = recentMinutesByPlayer[p.id] ?? null;
    return {
      playerId: p.id,
      quality,
      availabilityStatus,
      recentMinutes,
      reason: explainSuggestion(quality, availabilityStatus, recentMinutes),
    };
  });

  return suggestions.sort(
    (a, b) => availabilityRank(a.availabilityStatus) - availabilityRank(b.availabilityStatus) || qualityRank(a.quality) - qualityRank(b.quality)
  );
}
