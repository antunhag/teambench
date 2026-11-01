import type { Zona3 } from "@teambench/engine";

export interface Contagem {
  period: number;
  total: number;
}

/** Superioridades com botão próprio (escolha do utilizador, 2026-11-01); as restantes no "…". */
export const TRANSICOES_RAPIDAS = ["3x1", "2x1", "3x2", "2x0"];

/** Mosaico de contagem: o próprio mosaico é o "+", com "−" sempre à vista ao lado (decisão 3). */
export function Tile({
  label,
  c,
  tone,
  disabled,
  canMinus,
  onPlus,
  onMinus,
}: {
  label: string;
  c: Contagem;
  tone: "pos" | "neg" | "vi";
  disabled?: boolean;
  canMinus: boolean;
  onPlus: () => void;
  onMinus: () => void;
}) {
  return (
    <div className={`cv-tile ${tone}`}>
      <button type="button" className="plus" disabled={disabled} onClick={onPlus}>
        <span className="k">{label}</span>
        <span className="v">
          {c.period}
          <em>· {c.total}</em>
        </span>
      </button>
      <button type="button" className="minus" disabled={!canMinus} onClick={onMinus} aria-label={`Anular o último: ${label}`}>
        −
      </button>
    </div>
  );
}

export type TransKey = "favor_ganha" | "favor_perdida" | "contra_ganha" | "contra_perdida";

/**
 * Transições em 1 toque já com o tipo (decisão 5): 4 filas (nossa/deles ×
 * com/sem finalização), cada uma com as superioridades rápidas + "…" e o "−".
 */
export function TransitionsCard({
  counts,
  canMinus,
  disabled,
  onPick,
  onMore,
  onMinus,
}: {
  counts: Record<TransKey, Contagem>;
  canMinus: Record<TransKey, boolean>;
  disabled: boolean;
  onPick: (k: TransKey, numeros: string) => void;
  onMore: (k: TransKey) => void;
  onMinus: (k: TransKey) => void;
}) {
  const rows: { k: TransKey; label: string; tone: "pos" | "neg" }[] = [
    { k: "favor_ganha", label: "Nossa · com fin.", tone: "pos" },
    { k: "favor_perdida", label: "Nossa · sem fin.", tone: "pos" },
    { k: "contra_ganha", label: "Deles · com fin.", tone: "neg" },
    { k: "contra_perdida", label: "Deles · sem fin.", tone: "neg" },
  ];
  return (
    <div className="cv-panel">
      <h4>Transições — 1 toque regista com a superioridade</h4>
      {rows.map(({ k, label, tone }) => (
        <div key={k} className={`cv-trow ${tone}`}>
          <span className="lab">
            {label}
            <b>
              {counts[k].period}
              <em>· {counts[k].total}</em>
            </b>
          </span>
          {TRANSICOES_RAPIDAS.map((n) => (
            <button key={n} type="button" className="cv-chip" disabled={disabled} onClick={() => onPick(k, n)}>
              {n}
            </button>
          ))}
          <button type="button" className="cv-chip more" disabled={disabled} onClick={() => onMore(k)} aria-label="Outras superioridades">
            …
          </button>
          <button type="button" className="cv-mn" disabled={!canMinus[k]} onClick={() => onMinus(k)} aria-label={`Anular a última: ${label}`}>
            −
          </button>
        </div>
      ))}
    </div>
  );
}

export type AdvKey = "golo_sofrido" | "remate_adv_defendido" | "remate_adv_fora" | "remate_adv_bloqueado";

/** Cartão "Adversário" (decisão 6): golo sofrido e remates deles. */
export function AdversarioCard({
  counts,
  canMinus,
  disabled,
  defesaDisabled,
  onPlus,
  onMinus,
}: {
  counts: Record<AdvKey, Contagem>;
  canMinus: Record<AdvKey, boolean>;
  disabled: boolean;
  /** Sem GR em quadra (ex.: goleiro-linha), "Defendido" não tem a quem ser atribuído. */
  defesaDisabled: boolean;
  onPlus: (k: AdvKey) => void;
  onMinus: (k: AdvKey) => void;
}) {
  const tiles: { k: AdvKey; label: string; tone: "neg" | "vi" }[] = [
    { k: "golo_sofrido", label: "Golo sofrido", tone: "neg" },
    { k: "remate_adv_defendido", label: "Defendido", tone: "vi" },
    { k: "remate_adv_fora", label: "Fora", tone: "vi" },
    { k: "remate_adv_bloqueado", label: "Bloqueado", tone: "vi" },
  ];
  return (
    <div className="cv-panel">
      <h4>Adversário</h4>
      <div className="cv-tiles c4">
        {tiles.map(({ k, label, tone }) => (
          <Tile
            key={k}
            label={label}
            c={counts[k]}
            tone={tone}
            disabled={disabled || (k === "remate_adv_defendido" && defesaDisabled)}
            canMinus={canMinus[k]}
            onPlus={() => onPlus(k)}
            onMinus={() => onMinus(k)}
          />
        ))}
      </div>
    </div>
  );
}

/** Cartão "Bola": perdas e recuperações por terço, sem jogador (FR-016). */
export function BolaCard({
  counts,
  canMinus,
  disabled,
  onPlus,
  onMinus,
}: {
  counts: { perda: Record<Zona3, Contagem>; recuperacao: Record<Zona3, Contagem> };
  canMinus: { perda: Record<Zona3, boolean>; recuperacao: Record<Zona3, boolean> };
  disabled: boolean;
  onPlus: (tipo: "perda" | "recuperacao", z: Zona3) => void;
  onMinus: (tipo: "perda" | "recuperacao", z: Zona3) => void;
}) {
  const zonas: { z: Zona3; label: string }[] = [
    { z: "defesa", label: "Defesa" },
    { z: "meio", label: "Meio" },
    { z: "ataque", label: "Ataque" },
  ];
  const fila = (tipo: "perda" | "recuperacao", titulo: string, tone: "pos" | "neg") => (
    <div className="cv-prrow">
      <span className={`lab ${tone}`}>{titulo}</span>
      <div className="cv-tiles c3">
        {zonas.map(({ z, label }) => (
          <Tile
            key={z}
            label={label}
            c={counts[tipo][z]}
            tone={tone}
            disabled={disabled}
            canMinus={canMinus[tipo][z]}
            onPlus={() => onPlus(tipo, z)}
            onMinus={() => onMinus(tipo, z)}
          />
        ))}
      </div>
    </div>
  );
  return (
    <div className="cv-panel">
      <h4>Bola</h4>
      {fila("perda", "Perdas", "neg")}
      {fila("recuperacao", "Recuperações", "pos")}
    </div>
  );
}
