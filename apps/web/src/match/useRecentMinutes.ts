import { useCallback, useEffect, useState } from "preact/hooks";
import * as engine from "@teambench/engine";
import { supabase } from "../supabaseClient";
import { useMatchFormats } from "../team/useMatchFormats";

const RECENT_MATCH_COUNT = 5;
const FALLBACK_FORMAT: engine.MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

/**
 * Minutos recentes pra sugestão de rotação (specs/003-data-driven-rotation/)
 * — últimos RECENT_MATCH_COUNT jogos TERMINADOS desta equipa (Decisão 2,
 * research.md: contagem por jogos, não janela de tempo). Reaproveita
 * `engine.aggregateRecentMinutes`/`replayEvents` — nunca recalcula minutos
 * em SQL (Decisão 3). `excludeMatchId` tira o próprio jogo sendo planeado da
 * amostra, pra reabrir o planeamento de um jogo já terminado não contar ele
 * mesmo como "jogo recente".
 */
export function useRecentMinutes(teamId: string, excludeMatchId?: string) {
  const [recentMinutes, setRecentMinutes] = useState<engine.RecentMinutes[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const { formats } = useMatchFormats(teamId);

  const refresh = useCallback(async () => {
    setStatus("loading");
    let query = supabase
      .from("matches")
      .select("id, format_id")
      .eq("team_id", teamId)
      .eq("status", "finished")
      .order("match_date", { ascending: false })
      .limit(RECENT_MATCH_COUNT);
    if (excludeMatchId) query = query.neq("id", excludeMatchId);

    const { data: recentMatches, error: matchesError } = await query;
    if (matchesError) {
      setStatus("error");
      setErrorMessage(matchesError.message);
      return;
    }
    if (!recentMatches || recentMatches.length === 0) {
      setRecentMinutes([]);
      setStatus("ready");
      return;
    }

    const matchInputs: engine.RecentMatchInput[] = [];
    for (const m of recentMatches) {
      const { data: rows, error: eventsError } = await supabase
        .from("match_events")
        .select("payload")
        .eq("match_id", m.id)
        .order("period", { ascending: true })
        .order("ms", { ascending: true });
      if (eventsError) {
        setStatus("error");
        setErrorMessage(eventsError.message);
        return;
      }
      const events = (rows ?? []).map((r) => r.payload as engine.MatchEvent);
      if (events.length === 0) continue;
      // Mesma reconstrução de useLiveMatch.ts: convocadoIds nunca é sincronizado à parte.
      const convocadoIds = Array.from(
        new Set(events.flatMap((e) => [e.playerId, e.outId, ...(e.lineup ?? [])].filter((x): x is string => !!x)))
      );
      const format =
        formats.find((f) => f.id === m.format_id) ?? formats.find((f) => f.isDefault) ?? formats[0] ?? FALLBACK_FORMAT;
      matchInputs.push({ convocadoIds, events, format });
    }

    setRecentMinutes(engine.aggregateRecentMinutes(matchInputs));
    setStatus("ready");
  }, [teamId, excludeMatchId, formats]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byPlayer: Record<string, engine.RecentMinutes> = {};
  recentMinutes.forEach((r) => {
    byPlayer[r.playerId] = r;
  });

  return { recentMinutes, byPlayer, status, errorMessage, refresh };
}
