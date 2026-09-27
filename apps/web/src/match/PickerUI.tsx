import type { ComponentChildren } from "preact";
import { isGoalkeeper, posAbbr } from "../team/positions";
import type { PlayerRow } from "../team/usePlayers";

/**
 * Peças de UI para escolher jogador/tipo/zona num evento — usadas tanto no
 * jogo ao vivo (LiveMatch) quanto no corretor pós-jogo (MatchEventEditor),
 * para que corrigir "quem fez a falta" ou "quem entrou" use exatamente o
 * mesmo seletor visual de sempre, em vez de reinventar um <select> à parte.
 */

export function PlayerChip({ p, onClick, dim }: { p: PlayerRow; onClick: () => void; dim?: boolean }) {
  const gk = isGoalkeeper(p.position);
  return (
    <button type="button" className={`pchip${gk ? " gr" : ""}${dim ? " dim" : ""}`} onClick={onClick}>
      <span className="n">#{p.num}</span>
      <span className="nm">{p.name}</span>
      <span className="pos">{posAbbr(p.position)}</span>
    </button>
  );
}

export function Sheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
        {children}
        <button type="button" className="btn ghost block" onClick={onClose} style={{ marginTop: 14 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
