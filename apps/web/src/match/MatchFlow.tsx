import { usePlayers } from "../team/usePlayers";
import { LiveMatch } from "./LiveMatch";
import { PreMatch } from "./PreMatch";
import { useLiveMatch } from "./useLiveMatch";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  onExit: () => void;
}

export function MatchFlow({ teamId, matchId, opponent, onExit }: Props) {
  const { players, status } = usePlayers(teamId);
  const live = useLiveMatch(matchId);

  return (
    <div>
      <button type="button" onClick={onExit} style={{ marginBottom: 12 }}>
        ← Voltar ao painel
      </button>
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
