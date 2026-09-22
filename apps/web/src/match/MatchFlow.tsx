import { useState } from "preact/hooks";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { usePlayers } from "../team/usePlayers";
import { LiveMatch } from "./LiveMatch";
import { MatchSummary } from "./MatchSummary";
import { PreMatch } from "./PreMatch";
import { useLiveMatch } from "./useLiveMatch";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  onExit: () => void;
  sync: ReturnType<typeof useOutboxSync>;
}

export function MatchFlow({ teamId, matchId, opponent, onExit, sync }: Props) {
  const { players, status } = usePlayers(teamId);
  const activeRoster = players.filter((p) => p.active); // jogo ao vivo só convoca atletas ativos
  const live = useLiveMatch(matchId, teamId);
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button type="button" onClick={onExit}>
          ← Voltar ao painel
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sync.pending > 0 && (
            <span style={{ fontSize: 12, color: "#a60" }}>
              {sync.syncing ? "A sincronizar..." : `${sync.pending} evento(s) por sincronizar`}
            </span>
          )}
          {live.state.started && !showSummary && (
            <button type="button" onClick={() => setShowSummary(true)}>📋 Resumo</button>
          )}
        </div>
      </div>
      {status === "loading" ? (
        <p>A carregar plantel...</p>
      ) : showSummary ? (
        <MatchSummary live={live} roster={activeRoster} opponent={opponent} matchId={matchId} onClose={() => setShowSummary(false)} />
      ) : !live.state.started ? (
        <PreMatch live={live} roster={activeRoster} opponent={opponent} />
      ) : (
        <LiveMatch live={live} roster={activeRoster} opponent={opponent} />
      )}
    </div>
  );
}
