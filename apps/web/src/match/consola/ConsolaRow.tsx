import { memo } from "preact/compat";
import { useState } from "preact/hooks";
import { isGoalkeeper, posAbbr } from "../../team/positions";
import type { PlayerRow } from "../../team/usePlayers";

export type RowAction =
  | "golo"
  | "golo_sofrido"
  | "falta"
  | "falta_sofrida"
  | "amarelo"
  | "vermelho"
  | "mais"
  | "sai"
  | "tirar"
  | "remate_defendido"
  | "remate_fora"
  | "remate_bloqueado"
  | "defesa"
  | "remate_adv_fora"
  | "remate_adv_bloqueado";
export type Density = "A" | "B";

export interface ConsolaRowProps {
  slot: number;
  player: PlayerRow | null;
  minutes: number;
  goals: number;
  density: Density;
  /** "events": ações normais; "pick-out": só "SAI"; "prekickoff": só "Tirar do cinco"; "off": intervalo (só o ⋯, para substituir); "done": jogo terminado, nada regista. */
  mode: "events" | "pick-out" | "prekickoff" | "off" | "done";
  inTreatment: boolean;
  /** Estável entre renders (ver Consola) — é o que deixa `memo` saltar a linha a cada segundo do relógio. */
  onAction: (playerId: string, action: RowAction) => void;
}

/**
 * Uma linha por jogador em quadra (FR-007): cada toque fica atribuído a este
 * jogador sem seleção prévia. Densidade B (defeito): Golo · Remate ▸ · Falta
 * feita · Falta recebida · ⋯; "Remate ▸" abre o desfecho NA PRÓPRIA LINHA, à
 * mesma altura (Defendido · Fora · Bloqueado · ✕), sem folha nem scroll. A
 * linha do GR tem os remates do adversário em vez de remate próprio (FR-009,
 * FR-024). Densidade A: tudo à vista (pode partir em duas filas no iPhone).
 */
function ConsolaRowImpl({ slot, player, minutes, goals, density, mode, inTreatment, onAction }: ConsolaRowProps) {
  const [remateAberto, setRemateAberto] = useState(false);
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
  const act = (a: RowAction) => () => {
    setRemateAberto(false);
    onAction(player.id, a);
  };
  const disabled = mode === "off" || mode === "done";
  // Desfechos do remate: nossos na linha de campo; do adversário na linha do GR.
  const desfechos: { a: RowAction; label: string; cls: string }[] = gk
    ? [
        { a: "defesa", label: "Defen­dido", cls: "gk" },
        { a: "remate_adv_fora", label: "Fora", cls: "" },
        { a: "remate_adv_bloqueado", label: "Bloque­ado", cls: "" },
      ]
    : [
        { a: "remate_defendido", label: "Defen­dido", cls: "" },
        { a: "remate_fora", label: "Fora", cls: "" },
        { a: "remate_bloqueado", label: "Bloque­ado", cls: "" },
      ];
  const desfechoBtns = desfechos.map((d) => (
    <button key={d.a} type="button" className={`cbtn shot ${d.cls}`} disabled={disabled} onClick={act(d.a)}>
      {d.label}
    </button>
  ));
  const goloBtn = gk ? (
    <button type="button" className="cbtn opp" disabled={disabled} onClick={act("golo_sofrido")}>
      Golo sofr­ido
    </button>
  ) : (
    <button type="button" className="cbtn goal" disabled={disabled} onClick={act("golo")}>
      Golo
    </button>
  );
  const faltas = (
    <>
      <button type="button" className="cbtn" disabled={disabled} onClick={act("falta")}>
        Falta feita
      </button>
      <button type="button" className="cbtn" disabled={disabled} onClick={act("falta_sofrida")}>
        Falta rece­bida
      </button>
    </>
  );
  const mais = (
    <button type="button" className="cbtn more" disabled={mode === "done"} onClick={act("mais")} aria-label="Mais ações">
      ⋯
    </button>
  );

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
  } else if (remateAberto && density === "B") {
    actions = (
      <>
        {desfechoBtns}
        <button type="button" className="cbtn more" onClick={() => setRemateAberto(false)} aria-label="Fechar remate">
          ✕
        </button>
      </>
    );
  } else if (density === "A") {
    actions = (
      <>
        {goloBtn}
        {desfechoBtns}
        <button type="button" className="cbtn yellow" disabled={disabled} onClick={act("amarelo")} aria-label="Amarelo">
          🟨
        </button>
        <button type="button" className="cbtn red" disabled={disabled} onClick={act("vermelho")} aria-label="Vermelho">
          🟥
        </button>
        {faltas}
        {mais}
      </>
    );
  } else {
    actions = (
      <>
        {goloBtn}
        <button type="button" className="cbtn shot" disabled={disabled} onClick={() => setRemateAberto(true)}>
          {gk ? "Remate deles ▸" : "Remate ▸"}
        </button>
        {faltas}
        {mais}
      </>
    );
  }

  return (
    <div className={`consola-row${gk ? " gr" : ""}${inTreatment ? " treat" : ""}${density === "A" ? " dens-a" : ""}`} data-slot={slot}>
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
