import { contarCategoria, eventosEfetivos, ultimoDaCategoria, type CategoriaEquipa, type MatchEvent } from "@teambench/engine";
import { Sheet } from "../PickerUI";

type Linha = { label: string; conta: (e: MatchEvent) => boolean };

const NOSSAS: Linha[] = [
  { label: "Golos", conta: (e) => e.type === "golo" },
  { label: "Remates defendidos", conta: (e) => e.type === "remate" && e.desfecho === "defendido" },
  { label: "Remates fora", conta: (e) => e.type === "remate" && e.desfecho === "fora" },
  { label: "Remates bloqueados", conta: (e) => e.type === "remate" && e.desfecho === "bloqueado" },
  { label: "Faltas feitas", conta: (e) => e.type === "falta" },
  { label: "Faltas recebidas", conta: (e) => e.type === "falta_sofrida" },
  { label: "Amarelos", conta: (e) => e.type === "cartao_amarelo" },
  { label: "Vermelhos", conta: (e) => e.type === "cartao_vermelho" },
  { label: "Saídas 1x1 ganhas", conta: (e) => e.type === "saida" && e.resultado === "ganha" },
  { label: "Saídas 1x1 perdidas", conta: (e) => e.type === "saida" && e.resultado === "perdida" },
  { label: "Substituições", conta: (e) => e.type === "substituicao" },
];

export const CATEGORIAS_EQUIPA: { cat: CategoriaEquipa; label: string }[] = [
  { cat: "transicao_favor", label: "Transições a favor" },
  { cat: "transicao_contra", label: "Transições contra" },
  { cat: "golo_sofrido", label: "Golos sofridos" },
  { cat: "remate_adv_defendido", label: "Remates deles defendidos" },
  { cat: "remate_adv_fora", label: "Remates deles fora" },
  { cat: "remate_adv_bloqueado", label: "Remates deles bloqueados" },
  { cat: "perda_defesa", label: "Perdas — defesa" },
  { cat: "perda_meio", label: "Perdas — meio-campo" },
  { cat: "perda_ataque", label: "Perdas — ataque" },
  { cat: "recuperacao_defesa", label: "Recuperações — defesa" },
  { cat: "recuperacao_meio", label: "Recuperações — meio-campo" },
  { cat: "recuperacao_ataque", label: "Recuperações — ataque" },
];

/**
 * Resumo rápido (FR-027): parte atual vs. jogo, sempre sobre os eventos
 * efetivos (sem anulados). As categorias de equipa têm aqui o seu "−"
 * (FR-025) — é o caminho no iPhone, onde a barra não tem espaço para eles.
 */
export function SummarySheet({
  events,
  period,
  canAnular,
  onAnular,
  onOpenFullSummary,
  onClose,
}: {
  events: MatchEvent[];
  period: number;
  canAnular: boolean;
  onAnular: (alvoId: string) => void;
  onOpenFullSummary: () => void;
  onClose: () => void;
}) {
  const efetivos = eventosEfetivos(events);
  const conta = (l: Linha, soParte: boolean) => efetivos.filter((e) => l.conta(e) && (!soParte || e.period === period)).length;
  return (
    <Sheet title="Resumo rápido" onClose={onClose}>
      <table className="consola-summary">
        <thead>
          <tr>
            <th />
            <th>{period}ª parte</th>
            <th>Jogo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {NOSSAS.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num">{conta(l, true)}</td>
              <td className="num">{conta(l, false)}</td>
              <td />
            </tr>
          ))}
          <tr className="sep">
            <td colSpan={4}>Equipa e adversário</td>
          </tr>
          {CATEGORIAS_EQUIPA.map(({ cat, label }) => {
            const c = contarCategoria(events, cat, period);
            const alvo = ultimoDaCategoria(events, cat);
            return (
              <tr key={cat}>
                <td>{label}</td>
                <td className="num">{c.period}</td>
                <td className="num">{c.total}</td>
                <td>
                  <button
                    type="button"
                    className="btn sm consola-minus"
                    disabled={!canAnular || !alvo}
                    aria-label={`Anular o último: ${label}`}
                    onClick={() => alvo && onAnular(alvo.clientEventId ?? alvo.id)}
                  >
                    −
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">"−" anula só o último lance dessa categoria, sem apagar nada; "Desfazer" repõe.</p>
      <button type="button" className="btn block" style={{ marginTop: 12 }} onClick={onOpenFullSummary}>
        📋 Abrir o Resumo do jogo
      </button>
    </Sheet>
  );
}
