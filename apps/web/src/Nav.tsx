import * as engine from "@teambench/engine";
import { useEffect } from "preact/hooks";
import type { ScreenId } from "./useActiveScreen";

interface Props {
  role: engine.Role;
  activeScreen: ScreenId;
  onSelect: (screen: ScreenId) => void;
}

export function Nav({ role, activeScreen, onSelect }: Props) {
  const items = engine.visibleNavItems(role);

  // O ecrã guardado (F5, ou a última seleção antes de trocar de equipa) pode
  // já não ser permitido pro papel atual — ex.: era team_admin na equipa
  // anterior, é viewer nesta. Cai pro primeiro item visível em vez de ficar
  // preso num ecrã escondido (FR-005/FR-009).
  useEffect(() => {
    if (items.length > 0 && !items.some((item) => item.id === activeScreen)) {
      onSelect(items[0].id);
    }
  }, [role, activeScreen, items, onSelect]);

  return (
    <nav className="nav-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-tab${item.id === activeScreen ? " active" : ""}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
