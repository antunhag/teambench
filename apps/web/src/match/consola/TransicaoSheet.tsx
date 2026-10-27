import { TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM, TRANSICAO_NUMEROS_VANTAGEM } from "@teambench/engine";
import { Sheet } from "../PickerUI";

/**
 * Transição a favor/contra (FR-014, FR-015): "Com finalização" / "Sem
 * finalização", cada uma com os presets de superioridade; um toque num preset
 * regista e fecha (2 toques no total — SC-003). Nunca pede jogador.
 */
export function TransicaoSheet({
  dir,
  onPick,
  onClose,
}: {
  dir: "ofensiva" | "defensiva";
  onPick: (resultado: "ganha" | "perdida", numeros: string) => void;
  onClose: () => void;
}) {
  const presets = [...TRANSICAO_NUMEROS_VANTAGEM, ...TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM];
  const secao = (titulo: string, resultado: "ganha" | "perdida") => (
    <div>
      <h4 className="consola-sheet-h">{titulo}</h4>
      <div className="consola-presets">
        {presets.map((n) => (
          <button key={n} type="button" className={`abtn${TRANSICAO_NUMEROS_VANTAGEM.includes(n) ? "" : " dim"}`} onClick={() => onPick(resultado, n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Sheet title={dir === "ofensiva" ? "Transição a favor" : "Transição contra"} sub="Superioridade numérica (nós × eles)" onClose={onClose}>
      {secao("Com finalização", "ganha")}
      {secao("Sem finalização", "perdida")}
    </Sheet>
  );
}
