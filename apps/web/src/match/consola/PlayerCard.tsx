import { memo } from "preact/compat";
import { useState } from "preact/hooks";
import { isGoalkeeper, posAbbr } from "../../team/positions";
import type { PlayerRow } from "../../team/usePlayers";

export type CardAction =
  | "golo"
  | "falta"
  | "falta_sofrida"
  | "mais"
  | "sai"
  | "tirar"
  | "remate_defendido"
  | "remate_fora"
  | "remate_bloqueado"
  | "saida_ganha"
  | "saida_perdida";

export interface PlayerCardProps {
  slot: number;
  player: PlayerRow | null;
  minutes: number;
  goals: number;
  /** iPhone: tocar no nome abre o menu ⋯ (não há botão ⋯). */
  compact: boolean;
  /** "events": ações; "pick-out": só "SAI"; "prekickoff": só "Tirar do cinco"; "off": intervalo; "done": jogo terminado. */
  mode: "events" | "pick-out" | "prekickoff" | "off" | "done";
  /** Número do par que o "SAI" fecha na troca de linha (1, 2…), ou null numa troca simples. */
  saiN: number | null;
  inTreatment: boolean;
  /** Estável entre renders (ver Consola) — deixa `memo` saltar o cartão a cada segundo do relógio. */
  onAction: (playerId: string, action: CardAction) => void;
}

/**
 * Cartão de jogador da Consola v2 (contracts/consola-visual.md): ações na
 * própria linha (FR-007). Jogador de linha: Golo · Remate ▸ · Falta feita ·
 * Falta recebida; "Remate ▸" abre Defendido · Fora · Bloqueado · ✕ no mesmo
 * sítio. GR: Saída 1x1 ganha · Saída 1x1 perdida · Falta feita · Falta
 * recebida (os remates do adversário vivem no cartão "Adversário").
 */
function PlayerCardImpl({ slot, player, minutes, goals, compact, mode, saiN, inTreatment, onAction }: PlayerCardProps) {
  const [remate, setRemate] = useState(false);
  if (!player) {
    return (
      <div className="cv-card vacant" data-slot={slot}>
        <div className="cv-who">
          <span className="nm">Vaga</span>
        </div>
        <div className="cv-acts">
          <span className="cv-vacant">Toca num atleta do banco para repor</span>
        </div>
      </div>
    );
  }
  const gk = isGoalkeeper(player.position);
  const act = (a: CardAction) => () => {
    setRemate(false);
    onAction(player.id, a);
  };
  const off = mode === "off" || mode === "done";

  let acts;
  if (mode === "pick-out") {
    acts = (
      <button type="button" className="cv-a sai" onClick={act("sai")}>
        SAI{saiN ? ` · ${saiN}` : ""}
      </button>
    );
  } else if (mode === "prekickoff") {
    acts = (
      <button type="button" className="cv-a" onClick={act("tirar")}>
        Tirar do cinco
      </button>
    );
  } else if (remate && !gk) {
    acts = (
      <>
        <button type="button" className="cv-a shot" disabled={off} onClick={act("remate_defendido")}>
          Defen­dido
        </button>
        <button type="button" className="cv-a shot" disabled={off} onClick={act("remate_fora")}>
          Fora
        </button>
        <button type="button" className="cv-a shot" disabled={off} onClick={act("remate_bloqueado")}>
          Bloque­ado
        </button>
        <button type="button" className="cv-a close" onClick={() => setRemate(false)} aria-label="Fechar remate">
          ✕
        </button>
      </>
    );
  } else {
    acts = (
      <>
        {gk ? (
          <>
            <button type="button" className="cv-a win" disabled={off} onClick={act("saida_ganha")}>
              Saída 1x1 ganha
            </button>
            <button type="button" className="cv-a lose" disabled={off} onClick={act("saida_perdida")}>
              Saída 1x1 perdida
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cv-a goal" disabled={off} onClick={act("golo")}>
              Golo
            </button>
            <button type="button" className="cv-a shot" disabled={off} onClick={() => setRemate(true)}>
              <span>Remate ▸</span>
              {!compact && <small>def · fora · bloq</small>}
            </button>
          </>
        )}
        <button type="button" className="cv-a foul" disabled={off} onClick={act("falta")}>
          Falta feita
        </button>
        <button type="button" className="cv-a fouled" disabled={off} onClick={act("falta_sofrida")}>
          Falta rece­bida
        </button>
      </>
    );
  }

  const meta = (
    <span className="meta">
      {posAbbr(player.position)} · {minutes}'{goals > 0 ? ` · ⚽${goals}` : ""}
      {inTreatment ? " · 🩹" : ""}
    </span>
  );
  return (
    <div className={`cv-card${gk ? " gk" : ""}${inTreatment ? " treat" : ""}`} data-slot={slot}>
      {compact ? (
        <button type="button" className="cv-who tap" disabled={mode === "done"} onClick={act("mais")} aria-label={`Mais ações — ${player.name}`}>
          <span className="num">#{player.num}</span>
          <span className="nm">{player.name}</span>
          {meta}
        </button>
      ) : (
        <div className="cv-who">
          <div>
            <span className="num">#{player.num}</span>
            <span className="nm">{player.name}</span>
            {meta}
          </div>
          <button type="button" className="cv-dots" disabled={mode === "done"} onClick={act("mais")} aria-label="Mais ações">
            ⋯
          </button>
        </div>
      )}
      <div className="cv-acts">{acts}</div>
    </div>
  );
}

export const PlayerCard = memo(PlayerCardImpl);
