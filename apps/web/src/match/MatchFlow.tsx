import type { useOutboxSync } from "../sync/useOutboxSync";
import { usePlayers } from "../team/usePlayers";
import { LiveMatch } from "./LiveMatch";
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
  const live = useLiveMatch(matchId, teamId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button type="button" onClick={onExit}>
          ← Voltar ao painel
        </button>
        {sync.pending > 0 && (
          <span style={{ fontSize: 12, color: "#a60" }}>
            {sync.syncing ? "A sincronizar..." : `${sync.pending} evento(s) por sincronizar`}
          </span>
        )}
      </div>
      {status === "loading" ? (
        <p>A carregar plantel...</p>
      ) : !live.state.started ? (
        <PreMatch live={live} roster={players} opponent={opponent} />
      ) : (
        <LiveMatch live={live} roster={players} opponent={opponent} />
      )}
    </div>
  );
}
