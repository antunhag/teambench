import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { useMatchFormats } from "../team/useMatchFormats";
import { isGoalkeeper, posAbbr } from "../team/positions";
import { usePlayers, type PlayerRow } from "../team/usePlayers";
import { useRotationPlan } from "./useRotationPlan";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  formatId: string | null;
  onClose: () => void;
}

const FALLBACK_FORMAT: engine.MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

/** "12:30" -> 750 segundos. Mesma validação de LiveMatch.tsx, em segundos em vez de ms. */
function parseMinSecToSeconds(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const SLOT_COLORS = ["#2a78d6", "#0ca30c", "#c98500", "#8b5cf6"];

export function RotationPlanner({ teamId, matchId, opponent, formatId, onClose }: Props) {
  const { players, status: playersStatus } = usePlayers(teamId);
  const { formats } = useMatchFormats(teamId);
  const { stints, status: planStatus, errorMessage, saveStints } = useRotationPlan(teamId, matchId);

  const format: engine.MatchFormat =
    formats.find((f) => f.id === formatId) ?? formats.find((f) => f.isDefault) ?? formats[0] ?? FALLBACK_FORMAT;

  const activeRoster = players.filter((p) => p.active).map(toEnginePlayer);
  const byId = (id: string) => activeRoster.find((p) => p.id === id);

  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [localStints, setLocalStints] = useState<engine.RotationStint[]>([]);
  const [period, setPeriod] = useState(1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Carrega o plano já salvo (se houver) uma única vez, assim que a leitura
  // termina — depois disso, quem manda é a edição local até "Guardar".
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    if (planStatus !== "ready" || loadedOnce) return;
    setLocalStints(stints);
    setIncluded(new Set(stints.map((s) => s.playerId)));
    setLoadedOnce(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStatus, loadedOnce]);

  if (playersStatus === "loading" || planStatus === "loading") {
    return <p className="empty">A carregar...</p>;
  }

  function toggleIncluded(id: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function regenerate() {
    const includedPlayers = activeRoster.filter((p) => included.has(p.id) && !isGoalkeeper(p.pos));
    setLocalStints(engine.generateRotationPlan(includedPlayers, format));
  }

  /** Edita o fim de um turno e empurra o início do próximo da mesma vaga junto — nunca cria buraco nem sobreposição. */
  function editStintEnd(stint: engine.RotationStint, newEndSec: number) {
    const durSec = format.periodMinutes * 60;
    const clamped = Math.max(stint.startSec + 1, Math.min(newEndSec, durSec));
    setLocalStints((prev) => {
      const next = engine.nextStintInSlot(prev, stint.slotIndex, stint.period, stint.endSec);
      return prev.map((s) => {
        if (s === stint) return { ...s, endSec: clamped };
        if (next && s === next) return { ...s, startSec: clamped };
        return s;
      });
    });
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      await saveStints(localStints);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  const periodStints = localStints.filter((s) => s.period === period).sort((a, b) => a.slotIndex - b.slotIndex || a.startSec - b.startSec);
  const slotIndexes = [...new Set(periodStints.map((s) => s.slotIndex))].sort((a, b) => a - b);
  const durSec = format.periodMinutes * 60;

  const totalByPlayer = engine.plannedSecondsByPlayer(localStints);
  const perPeriodByPlayer = engine.plannedSecondsByPlayerPerPeriod(localStints);
  const includedPlayersSorted = activeRoster
    .filter((p) => included.has(p.id))
    .sort((a, b) => (parseInt(a.num, 10) || 999) - (parseInt(b.num, 10) || 999));

  return (
    <div>
      <button type="button" className="btn sm ghost" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Voltar ao painel
      </button>
      <h2 style={{ fontSize: 18 }}>Planear rotações — vs {opponent}</h2>
      <p className="hint">
        Previsão de tempo em quadra a partir de quem for incluído aqui — não mexe no jogo ao vivo, só avisa durante o
        jogo quando o tempo previsto de alguém está acabando.
      </p>

      <h3 className="section-title" style={{ marginTop: 16 }}>Incluídos no plano</h3>
      <div className="pgrid">
        {activeRoster.map((p) => {
          const gr = isGoalkeeper(p.pos);
          return (
            <button
              key={p.id}
              type="button"
              className={`pchip${gr ? " gr" : ""}${included.has(p.id) ? " selected" : ""}`}
              disabled={gr}
              onClick={() => toggleIncluded(p.id)}
              title={gr ? "Guarda-redes fica fora da rotação — joga a parte inteira" : undefined}
            >
              <span className="n">#{p.num}</span>
              <span className="nm">{p.name}</span>
              <span className="pos">{posAbbr(p.pos)}</span>
            </button>
          );
        })}
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={regenerate} disabled={includedPlayersSorted.length === 0}>
          🔁 Gerar automaticamente
        </button>
      </div>

      {localStints.length > 0 && (
        <>
          <div className="btn-row" style={{ marginTop: 16 }}>
            {Array.from({ length: format.periodCount }, (_, i) => i + 1).map((p) => (
              <button key={p} type="button" className={`btn sm${p === period ? " primary" : " ghost"}`} onClick={() => setPeriod(p)}>
                {engine.periodLabel(p, format)}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            {slotIndexes.map((slotIndex) => {
              const slotStints = periodStints.filter((s) => s.slotIndex === slotIndex);
              const color = SLOT_COLORS[slotIndex % SLOT_COLORS.length];
              return (
                <div key={slotIndex} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      height: 24,
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "var(--surface-2)",
                      marginBottom: 6,
                    }}
                  >
                    {slotStints.map((s) => {
                      const p = byId(s.playerId);
                      const widthPct = ((s.endSec - s.startSec) / durSec) * 100;
                      return (
                        <div
                          key={s.playerId + s.startSec}
                          style={{
                            width: `${widthPct}%`,
                            background: color,
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            borderRight: "1px solid rgba(255,255,255,.5)",
                          }}
                          title={`${p?.name ?? "?"} — ${engine.fmtMinSec(s.startSec * 1000)} a ${engine.fmtMinSec(s.endSec * 1000)}`}
                        >
                          #{p?.num ?? "?"}
                        </div>
                      );
                    })}
                  </div>
                  {slotStints.map((s, i) => {
                    const p = byId(s.playerId);
                    const isLast = i === slotStints.length - 1;
                    return (
                      <div key={s.playerId + s.startSec} className="hint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span>#{p?.num} {p?.name}</span>
                        <span>{engine.fmtMinSec(s.startSec * 1000)} até</span>
                        {isLast ? (
                          <span>{engine.fmtMinSec(s.endSec * 1000)} (fim da parte)</span>
                        ) : (
                          <input
                            type="text"
                            defaultValue={engine.fmtMinSec(s.endSec * 1000)}
                            style={{ width: 56 }}
                            onBlur={(e) => {
                              const sec = parseMinSecToSeconds(e.currentTarget.value);
                              if (sec != null) editStintEnd(s, sec);
                              else e.currentTarget.value = engine.fmtMinSec(s.endSec * 1000);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <h3 className="section-title" style={{ marginTop: 16 }}>Minutos previstos</h3>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Atleta</th>
                  {Array.from({ length: format.periodCount }, (_, i) => i + 1).map((p) => (
                    <th key={p} className="num">{engine.periodLabel(p, format).replace(" Parte", "")}</th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {includedPlayersSorted.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.num} {p.name}</td>
                    {Array.from({ length: format.periodCount }, (_, i) => i + 1).map((per) => (
                      <td key={per} className="num">{engine.fmtMinSec((perPeriodByPlayer[p.id]?.[per] ?? 0) * 1000)}</td>
                    ))}
                    <td className="num">{engine.fmtMinSec((totalByPlayer[p.id] ?? 0) * 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn primary" onClick={handleSave} disabled={saveState === "saving"}>
              {saveState === "saving" ? "A guardar..." : "Guardar plano"}
            </button>
          </div>
          {saveState === "saved" && <p className="hint">Plano guardado.</p>}
          {saveState === "error" && <p className="banner error">Não consegui guardar — {saveError}</p>}
        </>
      )}
      {planStatus === "error" && <p className="banner error">Não consegui carregar o plano — {errorMessage}</p>}
    </div>
  );
}
