import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

const POLL_MS = 15_000;

/**
 * Ponto atual do jogo (parte + segundo decorrido), só leitura, reconstruído a
 * partir dos `match_events` já sincronizados — specs/006-live-rotation-replan/.
 *
 * NUNCA toca localStorage/outbox nem reivindica a trava do jogo (ver
 * useMatchLock): ao contrário de `useLiveMatch` (que só quem segura a trava
 * monta, ver comentário em MatchFlow.tsx), a aba Rotações pode estar aberta
 * em qualquer aparelho, inclusive um que não é dono do registo ao vivo — este
 * hook segue o mesmo padrão seguro já usado por `ReadOnlyMatch.tsx` (só
 * leitura, poll de eventos já sincronizados), nunca o de quem está a
 * registar o jogo.
 *
 * `null` enquanto carrega ou se o jogo ainda não começou (sem eventos).
 */
export function useLiveMatchPoint(matchId: string, format: engine.MatchFormat, enabled: boolean) {
  const [point, setPoint] = useState<engine.RotationStartPoint | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPoint(null);
      return;
    }
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("match_events")
        .select("payload")
        .eq("match_id", matchId)
        .order("period", { ascending: true })
        .order("ms", { ascending: true });
      if (cancelled || error || !data || data.length === 0) return;
      const events = data.map((row) => row.payload as engine.MatchEvent);
      const convocadoIds = Array.from(
        new Set(events.flatMap((e) => [e.playerId, e.outId, ...(e.lineup ?? [])].filter((x): x is string => !!x)))
      );
      const state = engine.replayEvents(convocadoIds, events, format);
      if (state.finished) {
        setPoint(null); // jogo encerrado — nunca faz sentido "replanejar o resto".
        return;
      }
      const elapsedMs = engine.matchElapsedMs(state, Date.now());
      setPoint({ period: state.period, elapsedSec: Math.floor(elapsedMs / 1000) });
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchId, format, enabled]);

  return point;
}
