import {
  TIPOS_GOLO_BOLA_PARADA,
  TIPOS_GOLO_ESPECIAL,
  TIPOS_GOLO_JOGO_ABERTO,
  TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM,
  TRANSICAO_NUMEROS_VANTAGEM,
} from "@teambench/engine";
import { useState } from "preact/hooks";
import type { PlayerRow } from "../../team/usePlayers";
import { PlayerChip, Sheet } from "../PickerUI";

/**
 * Grelha de zonas na disposição de referência do clube (spec 009,
 * Clarifications): quadra inteira deitada, nossa baliza à esquerda, colunas
 * 1-3 | 4-6 ‖ 7-9 | 10-12, cada coluna de cima para baixo, meio-campo entre
 * a 2ª e a 3ª coluna. Os valores são os mesmos de sempre (`ZONAS_GOLO`).
 */
export function ZoneGrid({ value, onPick }: { value: number | null; onPick: (z: number) => void }) {
  const cols = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ];
  return (
    <div className="consola-zones">
      <div className="consola-zones-legend">
        <span>◀ Nossa baliza</span>
        <span>ataque →</span>
        <span>Baliza adversária ▶</span>
      </div>
      <div className="consola-zones-court">
        {cols.map((col, i) => (
          <div key={i} className={`consola-zones-col${i === 1 ? " mid-left" : ""}`}>
            {col.map((z) => (
              <button key={z} type="button" className={`zbtn${value === z ? " selected" : ""}`} onClick={() => onPick(z)}>
                {z}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface GoalDraft {
  side: "nos" | "adv";
  scorerId: string | null;
  /** Instante do 1º toque (abrir a folha) — mesma regra do "Jogo ao vivo". */
  openedAtMs: number;
}

export interface GoalResult {
  scorerId: string | null;
  assistId: string | null;
  tipo: string | null;
  zona: number | null;
  transicaoNumeros: string | null;
  balizaDeserta: boolean;
  openedAtMs: number;
}

/**
 * Golo nosso (marcador já escolhido pela linha) ou golo sofrido. Tudo o
 * resto é opcional: "Golo" + "Confirmar" chega (SC-003). Produz exatamente
 * os mesmos campos que o "Jogo ao vivo" grava em doGoal/doOppGoal.
 */
export function GoalSheet({
  draft,
  onCourt,
  roster,
  opponent,
  onConfirm,
  onClose,
}: {
  draft: GoalDraft;
  onCourt: PlayerRow[];
  roster: Map<string, PlayerRow>;
  opponent: string | null;
  onConfirm: (r: GoalResult) => void;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<string | null>(null);
  const [zona, setZona] = useState<number | null>(null);
  const [assistId, setAssistId] = useState<string | null>(null);
  const [transicaoNumeros, setTransicaoNumeros] = useState<string | null>(null);
  const [balizaDeserta, setBalizaDeserta] = useState(false);
  const scorer = draft.scorerId ? roster.get(draft.scorerId) : undefined;

  function pickTipo(t: string) {
    setTipo((cur) => (cur === t ? null : t));
    setTransicaoNumeros(null);
    setBalizaDeserta(false);
  }

  const groups = [
    { label: "Jogo aberto", tipos: TIPOS_GOLO_JOGO_ABERTO },
    { label: "Bola parada", tipos: TIPOS_GOLO_BOLA_PARADA },
    { label: "Penalidades e situações especiais", tipos: TIPOS_GOLO_ESPECIAL },
  ];

  return (
    <Sheet
      title={draft.side === "nos" ? `Golo — #${scorer?.num ?? ""} ${scorer?.name ?? ""}` : `Golo sofrido — ${opponent || "adversário"}`}
      sub="Detalhes opcionais"
      onClose={onClose}
    >
      <button
        type="button"
        className="btn primary block consola-confirm"
        onClick={() => onConfirm({ scorerId: draft.scorerId, assistId, tipo, zona, transicaoNumeros, balizaDeserta, openedAtMs: draft.openedAtMs })}
      >
        {draft.side === "nos" ? "Confirmar golo" : "Confirmar golo sofrido"}
      </button>

      <p className="sub">Zona</p>
      <ZoneGrid value={zona} onPick={(z) => setZona((cur) => (cur === z ? null : z))} />

      {groups.map((g) => (
        <div key={g.label}>
          <p className="sub">{g.label}</p>
          <div className="actiongrid">
            {g.tipos.map((t) => (
              <button key={t.id} type="button" className={`abtn${tipo === t.id ? " selected" : ""}`} onClick={() => pickTipo(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {tipo === "trs" && (
        <>
          <p className="sub">Superioridade numérica</p>
          <div className="actiongrid">
            {[...TRANSICAO_NUMEROS_VANTAGEM, ...TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM].map((n) => (
              <button
                key={n}
                type="button"
                className={`abtn${transicaoNumeros === n ? " selected" : ""}`}
                onClick={() => setTransicaoNumeros((cur) => (cur === n ? null : n))}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`abtn${balizaDeserta ? " selected" : ""}`}
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => setBalizaDeserta((b) => !b)}
          >
            🥅 Baliza deserta (goleiro-linha)
          </button>
        </>
      )}

      {draft.side === "nos" && (
        <>
          <p className="sub">Assistência</p>
          <div className="pgrid">
            {onCourt
              .filter((p) => p.id !== draft.scorerId)
              .map((p) => (
                <PlayerChip key={p.id} p={p} dim={assistId !== null && assistId !== p.id} onClick={() => setAssistId((cur) => (cur === p.id ? null : p.id))} />
              ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
