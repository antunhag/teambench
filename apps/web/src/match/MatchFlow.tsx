import type { MatchFormat } from "@teambench/engine";
import { useState } from "preact/hooks";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { useClubLabel } from "../team/useClubLabel";
import { useMatchFormats } from "../team/useMatchFormats";
import { usePlayers, type PlayerRow } from "../team/usePlayers";
import { Consola } from "./Consola";
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
  /** 'scheduled' | 'live' | 'finished' — vem direto de matches.status. Ver matchStatus abaixo. */
  status: string;
  onExit: () => void;
  sync: ReturnType<typeof useOutboxSync>;
  /** session.user.id — isolamento por proprietário da fila (ver outbox.ts). */
  ownerId: string;
  /** Tela de registo: "live" = "Jogo ao vivo" (por omissão); "consola" = Consola (specs/009-captura-detalhada/). Mesma trava e mesmo useLiveMatch nas duas. */
  view?: "live" | "consola";
  /** Só na Consola: sair dela (MatchHub volta à aba "Jogo"). */
  onLeave?: () => void;
}

// Usado só enquanto os formatos da equipa ainda não carregaram, ou se a
// equipa nunca chegou a configurar nenhum — nunca fica sem duração nenhuma.
const FALLBACK_FORMAT: MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

export function MatchFlow({ teamId, matchId, opponent, formatId, status: matchStatus, onExit, sync, ownerId, view = "live", onLeave = onExit }: Props) {
  const { players, status } = usePlayers(teamId);
  const { formats } = useMatchFormats(teamId);
  const ourLabel = useClubLabel(teamId);
  const activeRoster = players.filter((p) => p.active); // jogo ao vivo só convoca atletas ativos

  // O formato deste jogo específico (definido na criação/edição do jogo),
  // com fallback para o padrão da equipa — cada jogo respeita o SEU
  // period_count, nunca um valor fixo global.
  const matchingFormat = formats.find((f) => f.id === formatId) ?? formats.find((f) => f.isDefault) ?? formats[0];
  const format: MatchFormat = matchingFormat ?? FALLBACK_FORMAT;
  // Mínimo de convocados esperado (specs/007-convocados-sync/ US3) — à
  // parte de `format` porque esse é tipado como `engine.MatchFormat` (sem
  // `minConvocados`); `FALLBACK_FORMAT` nunca tem mínimo configurado.
  const minConvocados = matchingFormat?.minConvocados ?? null;

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
        <ReadOnlyMatch matchId={matchId} opponent={opponent} roster={activeRoster} format={format} ourLabel={ourLabel} />
      ) : (
        <MatchFlowEditor
          teamId={teamId}
          matchId={matchId}
          opponent={opponent}
          format={format}
          minConvocados={minConvocados}
          matchStatus={matchStatus}
          activeRoster={activeRoster}
          ourLabel={ourLabel}
          ownerId={ownerId}
          view={view}
          sync={sync}
          onLeave={onLeave}
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
  minConvocados,
  matchStatus,
  activeRoster,
  ourLabel,
  ownerId,
  view,
  sync,
  onLeave,
}: {
  teamId: string;
  matchId: string;
  opponent: string | null;
  format: MatchFormat;
  minConvocados: number | null;
  matchStatus: string;
  activeRoster: PlayerRow[];
  ourLabel: string;
  ownerId: string;
  view: "live" | "consola";
  sync: ReturnType<typeof useOutboxSync>;
  onLeave: () => void;
}) {
  const live = useLiveMatch(matchId, teamId, ownerId, format, matchStatus);
  const [showSummary, setShowSummary] = useState(false);
  // Confirmar o pré-jogo só leva à tela do jogo — não inicia o relógio
  // sozinho. O cinco inicial pode continuar incompleto até ali: o cronómetro
  // real do jogo raramente espera o treinador terminar de decidir.
  const [confirmed, setConfirmed] = useState(false);
  const showPreMatch = !live.state.started && !confirmed;

  // Evita mostrar a tela de escolher o cinco inicial por um instante para um
  // jogo que já começou (ver checkingRemote em useLiveMatch) — só sabe se
  // deve mesmo pedir o cinco inicial depois de checar se este aparelho tem
  // ou não progresso já sincronizado desse jogo.
  if (live.checkingRemote) {
    return <p className="empty">A carregar jogo...</p>;
  }

  return (
    <>
      {live.enqueueFailed && (
        <div className="banner error" style={{ marginBottom: 12 }}>
          Não foi possível guardar um evento deste jogo neste aparelho (armazenamento cheio ou indisponível). Tente
          noutro aparelho ou liberte espaço antes de continuar — o registo deste evento pode não estar seguro.
        </div>
      )}
      {live.state.started && !showSummary && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button type="button" className="btn sm" onClick={() => setShowSummary(true)}>📋 Resumo</button>
        </div>
      )}
      {showSummary ? (
        <MatchSummary
          live={live}
          roster={activeRoster}
          opponent={opponent}
          matchId={matchId}
          teamId={teamId}
          onClose={() => setShowSummary(false)}
          ourLabel={ourLabel}
        />
      ) : showPreMatch ? (
        <PreMatch live={live} roster={activeRoster} opponent={opponent} minConvocados={minConvocados} onConfirm={() => setConfirmed(true)} />
      ) : view === "consola" ? (
        <Consola
          live={live}
          roster={activeRoster}
          opponent={opponent}
          onViewSummary={() => setShowSummary(true)}
          ourLabel={ourLabel}
          sync={sync}
          onLeave={onLeave}
          matchId={matchId}
        />
      ) : (
        <LiveMatch live={live} roster={activeRoster} opponent={opponent} onViewSummary={() => setShowSummary(true)} ourLabel={ourLabel} />
      )}
    </>
  );
}
