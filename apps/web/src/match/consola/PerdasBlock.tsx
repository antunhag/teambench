import type { Zona3 } from "@teambench/engine";
import type { Contagem } from "./TeamBar";

const ZONAS: { z: Zona3; label: string }[] = [
  { z: "defesa", label: "Defesa" },
  { z: "meio", label: "Meio" },
  { z: "ataque", label: "Ataque" },
];

/**
 * Perdas e recuperações de bola por terço do campo, sem jogador (FR-016):
 * 1 toque no tablet (coluna lateral), 2 no iPhone (dentro de "Mais…").
 */
export function PerdasBlock({
  contagens,
  disabled,
  onPerda,
  onRecuperacao,
}: {
  contagens: { perda: Record<Zona3, Contagem>; recuperacao: Record<Zona3, Contagem> };
  disabled: boolean;
  onPerda: (z: Zona3) => void;
  onRecuperacao: (z: Zona3) => void;
}) {
  const linha = (titulo: string, tipo: "perda" | "recuperacao", on: (z: Zona3) => void) => (
    <div className="consola-perdas-row">
      <span className="lbl">{titulo}</span>
      {ZONAS.map(({ z, label }) => (
        <button key={z} type="button" className={`cbtn ${tipo}`} disabled={disabled} onClick={() => on(z)}>
          <span>{label}</span>
          <span className="cnt">
            {contagens[tipo][z].period} · {contagens[tipo][z].total}
          </span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="consola-perdas">
      {linha("Perda", "perda", onPerda)}
      {linha("Recup.", "recuperacao", onRecuperacao)}
    </div>
  );
}
