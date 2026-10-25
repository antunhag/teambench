import { memo } from "preact/compat";
import { isGoalkeeper, posAbbr } from "../../team/positions";
import type { PlayerRow } from "../../team/usePlayers";

export type RowAction = "golo" | "golo_sofrido" | "falta" | "falta_sofrida" | "amarelo" | "vermelho" | "mais" | "sai" | "tirar";
export type Density = "A" | "B";

export interface ConsolaRowProps {
  slot: number;
  player: PlayerRow | null;
  minutes: number;
  goals: number;
  density: Density;
  /** "events": ações normais; "pick-out": só "SAI"; "prekickoff": só "Tirar do cinco"; "off": tudo desativado (intervalo/fim). */
  mode: "events" | "pick-out" | "prekickoff" | "off";
  inTreatment: boolean;
  /** Estável entre renders (ver Consola) — é o que deixa `memo` saltar a linha a cada segundo do relógio. */
  onAction: (playerId: string, action: RowAction) => void;
}

/**
 * Uma linha por jogador em quadra (FR-007): cada toque fica atribuído a este
 * jogador sem seleção prévia. Densidade B (defeito) mostra as ações mais
 * frequentes e o resto no ⋯; A mostra também os cartões. "Remate ▸" só
 * chega na Etapa 2 (novos tipos de evento).
 */
function ConsolaRowImpl({ slot, player, minutes, goals, density, mode, inTreatment, onAction }: ConsolaRowProps) {
  if (!player) {
    return (
      <div className="consola-row vacant" data-slot={slot}>
        <div className="consola-who">
          <span className="nm">Vaga</span>
        </div>
        <div className="consola-actions">
          <span className="consola-vacant-hint">Toca num atleta do banco para repor</span>
        </div>
      </div>
    );
  }
  const gk = isGoalkeeper(player.position);
  const act = (a: RowAction) => () => onAction(player.id, a);
  const disabled = mode === "off";

  let actions;
  if (mode === "pick-out") {
    actions = (
      <button type="button" className="cbtn sai" onClick={act("sai")}>
        SAI
      </button>
    );
  } else if (mode === "prekickoff") {
    actions = (
      <button type="button" className="cbtn" onClick={act("tirar")}>
        Tirar do cinco
      </button>
    );
  } else {
    actions = (
      <>
        {gk ? (
          <button type="button" className="cbtn opp" disabled={disabled} onClick={act("golo_sofrido")}>
            Golo sofr&shy;ido
          </button>
        ) : (
          <button type="button" className="cbtn goal" disabled={disabled} onClick={act("golo")}>
            Golo
          </button>
        )}
        {density === "A" && (
          <>
            <button type="button" className="cbtn yellow" disabled={disabled} onClick={act("amarelo")} aria-label="Amarelo">
              🟨
            </button>
            <button type="button" className="cbtn red" disabled={disabled} onClick={act("vermelho")} aria-label="Vermelho">
              🟥
            </button>
          </>
        )}
        <button type="button" className="cbtn" disabled={disabled} onClick={act("falta")}>
          Falta feita
        </button>
        <button type="button" className="cbtn" disabled={disabled} onClick={act("falta_sofrida")}>
          Falta rece&shy;bida
        </button>
        <button type="button" className="cbtn more" onClick={act("mais")} aria-label="Mais ações">
          ⋯
        </button>
      </>
    );
  }

  return (
    <div className={`consola-row${gk ? " gr" : ""}${inTreatment ? " treat" : ""}`} data-slot={slot}>
      <div className="consola-who">
        <span className="n">#{player.num}</span>
        <span className="nm">{player.name}</span>
        <span className="meta">
          {posAbbr(player.position)} · {minutes}'{goals > 0 ? ` · ⚽${goals}` : ""}
          {inTreatment ? " · 🩹" : ""}
        </span>
      </div>
      <div className="consola-actions">{actions}</div>
    </div>
  );
}

export const ConsolaRow = memo(ConsolaRowImpl);
