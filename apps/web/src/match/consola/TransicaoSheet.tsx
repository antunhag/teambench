import { TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM, TRANSICAO_NUMEROS_VANTAGEM } from "@teambench/engine";
import { Sheet } from "../PickerUI";
import { TRANSICOES_RAPIDAS } from "./QuickPanel";

/**
 * Escolha da superioridade de uma transição. No tablet abre pelo "…" de uma
 * fila (só essa fila, todas as superioridades); no iPhone abre pelo mosaico
 * da transição (as duas filas, rápidas primeiro). Um toque regista e fecha.
 */
export function TransicaoSheet({
  dir,
  resultado,
  onPick,
  onClose,
}: {
  dir: "ofensiva" | "defensiva";
  /** Só esta fila (tablet, "…"); omitido = as duas filas (iPhone). */
  resultado?: "ganha" | "perdida";
  onPick: (resultado: "ganha" | "perdida", numeros: string) => void;
  onClose: () => void;
}) {
  const todas = [...TRANSICAO_NUMEROS_VANTAGEM, ...TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM];
  const ordem = resultado ? todas.filter((n) => !TRANSICOES_RAPIDAS.includes(n)) : [...TRANSICOES_RAPIDAS, ...todas.filter((n) => !TRANSICOES_RAPIDAS.includes(n))];
  const secao = (titulo: string, r: "ganha" | "perdida") => (
    <div key={r}>
      <h4 className="cv-sheet-h">{titulo}</h4>
      <div className="cv-presets">
        {ordem.map((n) => (
          <button key={n} type="button" className={`cv-chip${TRANSICOES_RAPIDAS.includes(n) ? " quick" : ""}`} onClick={() => onPick(r, n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  const nome = dir === "ofensiva" ? "Transição nossa" : "Transição deles";
  return (
    <Sheet title={resultado ? `${nome} — ${resultado === "ganha" ? "com" : "sem"} finalização` : nome} sub="Superioridade numérica (nós × eles)" onClose={onClose}>
      {(!resultado || resultado === "ganha") && secao("Com finalização", "ganha")}
      {(!resultado || resultado === "perdida") && secao("Sem finalização", "perdida")}
    </Sheet>
  );
}
