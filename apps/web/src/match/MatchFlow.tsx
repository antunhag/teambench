import type { MatchFormat } from "@teambench/engine";
import { useState } from "preact/hooks";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { useMatchFormats } from "../team/useMatchFormats";
import { usePlayers, type PlayerRow } from "../team/usePlayers";
import { LiveMatch } from "./LiveMatch";
import { MatchSummary } from "./MatchSummary";
import { PreMatch } from "./PreMatch";
import { ReadOnlyMatch } from "./ReadOnlyMatch";
import { useLiveMatch } from "./useLiveMatch";
import { useMatchLock } from "./useMatchLock";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  formatId: string | null;
  onExit: () => void;
  sync: ReturnType<typeof useOutboxSync>;
}

// Usado só enquanto os formatos da equipa ainda não carregaram, ou se a
// equipa nunca chegou a configurar nenhum — nunca fica sem duração nenhuma.
const FALLBACK_FORMAT: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

export function MatchFlow({ teamId, matchId, opponent, formatId, onExit, sync }: Props) {
  const { players, status } = usePlayers(teamId);
  const { formats } = useMatchFormats(teamId);
  const activeRoster = players.filter((p) => p.active); // jogo ao vivo só convoca atletas ativos

  // O formato deste jogo específico (definido na criação/edição do jogo),
  // com fallback para o padrão da equipa — cada jogo respeita o SEU
  // period_count, nunca um valor fixo global.
  const format: MatchFormat =
    formats.find((f) => f.id === formatId) ?? formats.find((f) => f.isDefault) ?? formats[0] ?? FALLBACK_FORMAT;

  // Só quem reivindicar a trava do jogo (useMatchLock) chega a montar
  // useLiveMatch — quem está em modo leitura não deve tocar em
  // localStorage/outbox do jogo de outra pessoa.
  const lock = useMatchLock(matchId);

  if (status === "loading" || lock.status === "checking") {
    return <p className="empty">A carregar jogo...</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button type="button" className="btn sm ghost" onClick={onExit}>
          ← Voltar ao painel
        </button>
        {sync.pending > 0 && (
          <span className="hint">{sync.syncing ? "A sincronizar..." : `${sync.pending} evento(s) por sincronizar`}</span>
        )}
      </div>
      {lock.status === "readonly" ? (
        <ReadOnlyMatch matchId={matchId} opponent={opponent} roster={activeRoster} format={format} />
      ) : (
        <MatchFlowEditor
          teamId={teamId}
          matchId={matchId}
          opponent={opponent}
          format={format}
          activeRoster={activeRoster}
        />
      )}
    </div>
  );
}

function MatchFlowEditor({
  teamId,
  matchId,
  opponent,
  format,
  activeRoster,
}: {
  teamId: string;
  matchId: string;
  opponent: string | null;
  format: MatchFormat;
  activeRoster: PlayerRow[];
}) {
  const live = useLiveMatch(matchId, teamId, format);
  const [showSummary, setShowSummary] = useState(false);

  return (
    <>
      {live.state.started && !showSummary && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" className="btn sm" onClick={() => setShowSummary(true)}>📋 Resumo</button>
        </div>
      )}
      {showSummary ? (
        <MatchSummary live={live} roster={activeRoster} opponent={opponent} matchId={matchId} onClose={() => setShowSummary(false)} />
      ) : !live.state.started ? (
        <PreMatch live={live} roster={activeRoster} opponent={opponent} />
      ) : (
        <LiveMatch live={live} roster={activeRoster} opponent={opponent} onViewSummary={() => setShowSummary(true)} />
      )}
    </>
  );
}
