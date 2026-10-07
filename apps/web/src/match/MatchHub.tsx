import { useState } from "preact/hooks";
import type { useOutboxSync } from "../sync/useOutboxSync";
import { MatchEventEditor } from "./MatchEventEditor";
import { MatchFlow } from "./MatchFlow";
import { RotationPlanner } from "./RotationPlanner";

type Tab = "jogo" | "rotacoes" | "registo";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  formatId: string | null;
  /** 'scheduled' | 'live' | 'finished' — vem direto de matches.status (ver
      useMatches.ts). Usado só para decidir se a aba "Registo" já faz
      sentido mostrar, nunca para mudar o que as telas internas fazem. */
  status: string;
  canManage: boolean;
  canTrackLive: boolean;
  ourLabel: string;
  sync: ReturnType<typeof useOutboxSync>;
  onExit: () => void;
}

/**
 * Ponto de entrada único por jogo — antes eram 3 botões separados na linha
 * do calendário (Iniciar jogo / Corrigir registo / Planear rotações), cada
 * um abrindo uma tela própria sem relação visual entre si, lotando a linha
 * (5 botões ao todo com Editar/Apagar) a ponto de precisar de uma coluna
 * fixa só pra caber. Agora é uma tela com abas, reaproveitando o mesmo
 * .nav-tabs/.nav-tab do menu principal (Calendário/Plantel/...) — as 3
 * telas internas (MatchFlow, RotationPlanner, MatchEventEditor) continuam
 * exatamente como eram, só passam a viver dentro de abas em vez de serem
 * o ecrã inteiro. Editar/Apagar ficam de fora de propósito: são gestão do
 * jogo como registo de calendário (data/adversário/local), não ações sobre
 * o jogo em si — ver docs/ROADMAP.md.
 */
export function MatchHub({ teamId, matchId, opponent, formatId, status, canManage, canTrackLive, ourLabel, sync, onExit }: Props) {
  const [tab, setTab] = useState<Tab>("jogo");

  // "Registo" só faz sentido depois de o jogo ter sido aberto ao vivo pelo
  // menos uma vez — status só sai de "scheduled" nesse momento (ver
  // claim_live_match em 0009_live_match_lock.sql). Não é uma contagem exata
  // de eventos, mas evita o problema original: a aba/botão de corrigir
  // aparecendo sempre, mesmo num jogo futuro sem nada ainda para corrigir.
  const showRegisto = canTrackLive && status !== "scheduled";
  const showRotacoes = canManage;

  return (
    <div>
      <nav className="nav-tabs" style={{ marginBottom: 12 }}>
        <button type="button" className={`nav-tab${tab === "jogo" ? " active" : ""}`} onClick={() => setTab("jogo")}>
          Jogo
        </button>
        {showRotacoes && (
          <button type="button" className={`nav-tab${tab === "rotacoes" ? " active" : ""}`} onClick={() => setTab("rotacoes")}>
            Rotações
          </button>
        )}
        {showRegisto && (
          <button type="button" className={`nav-tab${tab === "registo" ? " active" : ""}`} onClick={() => setTab("registo")}>
            Registo
          </button>
        )}
      </nav>

      {tab === "jogo" && (
        <MatchFlow teamId={teamId} matchId={matchId} opponent={opponent} formatId={formatId} onExit={onExit} sync={sync} />
      )}
      {tab === "rotacoes" && showRotacoes && (
        <RotationPlanner teamId={teamId} matchId={matchId} opponent={opponent} formatId={formatId} onClose={onExit} />
      )}
      {tab === "registo" && showRegisto && (
        <MatchEventEditor teamId={teamId} matchId={matchId} opponent={opponent} onClose={onExit} canDelete={canManage} ourLabel={ourLabel} />
      )}
    </div>
  );
}
