import type { ConsolaMode } from "./layout";

export interface Contagem {
  period: number;
  total: number;
}

export interface TeamBarProps {
  mode: ConsolaMode;
  period: number;
  favor: Contagem;
  contra: Contagem;
  golosSofridos: Contagem;
  /** Há um lance efetivo que o "−" dessa categoria anularia. */
  podeAnular: { favor: boolean; contra: boolean; golosSofridos: boolean };
  /** Duração do goleiro-linha em curso (ms), ou null. */
  goleiroLinhaMs: number | null;
  awaitingKickoff: boolean;
  finished: boolean;
  paused: boolean;
  isFinalPeriod: boolean;
  onTransicao: (dir: "ofensiva" | "defensiva") => void;
  onOppGoal: () => void;
  onAnular: (cat: "transicao_favor" | "transicao_contra" | "golo_sofrido") => void;
  onGoleiroLinha: () => void;
  onKickoff: () => void;
  onPause: () => void;
  onResume: () => void;
  onEndPeriod: () => void;
  onMore: () => void;
}

function fmt(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Barra de equipa (FR-012). Tablet: transições a favor/contra e golo sofrido
 * (cada um com "1ª n · total m" e "−" ao lado), GR-linha com duração, pausa,
 * fim da parte e "Mais…". iPhone vertical: as três categorias + "Mais…"; com
 * GR-linha ativo, o lugar de "Mais…" mostra o GR-linha (e "Mais…" passa para
 * a doca). O "−" no iPhone faz-se pelo Resumo rápido (FR-025).
 */
export function TeamBar(p: TeamBarProps) {
  if (p.finished) return null;
  const phoneV = p.mode === "iphone-v";
  const cnt = (c: Contagem) => (
    <span className="cnt">
      {p.period}ª {c.period} · total {c.total}
    </span>
  );
  if (p.awaitingKickoff) {
    return (
      <div className="consola-team">
        <button type="button" className="cbtn kick" onClick={p.onKickoff}>
          Iniciar Parte {p.period}
        </button>
        <button type="button" className="cbtn" onClick={p.onMore}>
          Mais…
        </button>
      </div>
    );
  }
  const grupo = (
    label: string,
    cls: string,
    c: Contagem,
    onTap: () => void,
    anular: boolean,
    onAnular: () => void
  ) => (
    <div className="tb-group">
      <button type="button" className={`cbtn ${cls}`} onClick={onTap}>
        <span>{label}</span>
        {cnt(c)}
      </button>
      {!phoneV && (
        <button type="button" className="cbtn minus" disabled={!anular} onClick={onAnular} aria-label={`Anular o último: ${label}`}>
          −
        </button>
      )}
    </div>
  );
  const glAtivo = p.goleiroLinhaMs !== null;
  const glBtn = (
    <button type="button" className={`cbtn${glAtivo ? " warn" : ""}`} onClick={p.onGoleiroLinha}>
      {glAtivo ? (
        <>
          <span>GR-linha {fmt(p.goleiroLinhaMs!)}</span>
          <span className="cnt">tocar para terminar</span>
        </>
      ) : (
        "GR-linha"
      )}
    </button>
  );
  return (
    <div className="consola-team">
      {grupo(phoneV ? "Trans. a favor" : "Transição a favor", "trans", p.favor, () => p.onTransicao("ofensiva"), p.podeAnular.favor, () => p.onAnular("transicao_favor"))}
      {grupo(phoneV ? "Trans. contra" : "Transição contra", "trans contra", p.contra, () => p.onTransicao("defensiva"), p.podeAnular.contra, () => p.onAnular("transicao_contra"))}
      {grupo("Golo sofrido", "opp", p.golosSofridos, p.onOppGoal, p.podeAnular.golosSofridos, () => p.onAnular("golo_sofrido"))}
      {phoneV ? (
        glAtivo ? (
          glBtn
        ) : (
          <button type="button" className="cbtn" onClick={p.onMore}>
            Mais…
          </button>
        )
      ) : (
        <>
          {glBtn}
          <button type="button" className={`cbtn${p.paused ? " warn" : ""}`} onClick={p.paused ? p.onResume : p.onPause}>
            {p.paused ? "▶ Retomar" : "⏸ Pausa"}
          </button>
          <button type="button" className="cbtn" onClick={p.onEndPeriod}>
            {p.isFinalPeriod ? "Terminar jogo" : `Fim da Parte ${p.period}`}
          </button>
          <button type="button" className="cbtn" onClick={p.onMore}>
            Mais…
          </button>
        </>
      )}
    </div>
  );
}
