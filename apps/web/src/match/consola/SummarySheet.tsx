import type { MatchEvent } from "@teambench/engine";
import { Sheet } from "../PickerUI";

const LINHAS: { label: string; types: MatchEvent["type"][] }[] = [
  { label: "Golos", types: ["golo"] },
  { label: "Golos sofridos", types: ["golo_sofrido"] },
  { label: "Faltas feitas", types: ["falta"] },
  { label: "Faltas recebidas", types: ["falta_sofrida"] },
  { label: "Amarelos", types: ["cartao_amarelo"] },
  { label: "Vermelhos", types: ["cartao_vermelho"] },
  { label: "Substituições", types: ["substituicao"] },
];

/**
 * Resumo rápido (FR-027): parte atual vs. jogo, só com contagens tiradas
 * dos próprios eventos. Etapa 1 = tipos que já existem; a Etapa 2 acrescenta
 * remates, transições e perdas/recuperações.
 */
export function SummarySheet({
  events,
  period,
  onOpenFullSummary,
  onClose,
}: {
  events: MatchEvent[];
  period: number;
  onOpenFullSummary: () => void;
  onClose: () => void;
}) {
  const count = (types: MatchEvent["type"][], onlyPeriod: boolean) =>
    events.filter((e) => types.includes(e.type) && (!onlyPeriod || e.period === period)).length;
  return (
    <Sheet title="Resumo rápido" onClose={onClose}>
      <table className="consola-summary">
        <thead>
          <tr>
            <th />
            <th>{period}ª parte</th>
            <th>Jogo</th>
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num">{count(l.types, true)}</td>
              <td className="num">{count(l.types, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn block" style={{ marginTop: 12 }} onClick={onOpenFullSummary}>
        📋 Abrir o Resumo do jogo
      </button>
    </Sheet>
  );
}
