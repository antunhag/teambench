import type { MatchFormat } from "@teambench/engine";
import { useState } from "preact/hooks";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { useMatchFormats } from "../team/useMatchFormats";
import { usePlayers } from "../team/usePlayers";
import { LiveMatch } from "./LiveMatch";
import { MatchSummary } from "./MatchSummary";
import { PreMatch } from "./PreMatch";
import { useLiveMatch } from "./useLiveMatch";

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

  const live = useLiveMatch(matchId, teamId, format);
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
        <LiveMatch live={live} roster={activeRoster} opponent={opponent} onViewSummary={() => setShowSummary(true)} />
      )}
    </div>
  );
}
