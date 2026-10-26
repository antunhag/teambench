import type { MatchEvent } from "@teambench/engine";
import type { PlayerRow } from "../../team/usePlayers";
import { ZoneGrid } from "./GoalSheet";

const ROTULO: Partial<Record<MatchEvent["type"], string>> = {
  falta: "Falta feita",
  falta_sofrida: "Falta recebida",
  cartao_amarelo: "Amarelo",
  cartao_vermelho: "Vermelho",
  remate: "Remate",
  remate_adv: "Remate deles",
  defesa: "Defesa",
  saida: "Saída 1x1",
};

/**
 * Zona rápida (FR-010/011): painel NÃO modal — sem fundo escurecido, não
 * desloca a lista e não bloqueia o resto da tela. Um toque numa zona grava-a;
 * ✕ fecha sem zona; qualquer outra ação também fecha (o lance anterior entra
 * na fila tal como está — ver deferredEnqueue.ts). Zona nunca obrigatória.
 */
export function ZonePanel({
  event,
  player,
  onPick,
  onClose,
}: {
  event: MatchEvent;
  player: PlayerRow | undefined;
  onPick: (zona: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="consola-zq" role="region" aria-label="Zona do lance (opcional)">
      <div className="consola-zq-head">
        <span>
          Zona · {ROTULO[event.type] ?? event.type}
          {player ? ` · #${player.num} ${player.name}` : ""} <span className="opt">(opcional)</span>
        </span>
        <button type="button" className="cbtn" aria-label="Sem zona" onClick={onClose}>
          ✕
        </button>
      </div>
      <ZoneGrid value={null} onPick={onPick} />
    </div>
  );
}
