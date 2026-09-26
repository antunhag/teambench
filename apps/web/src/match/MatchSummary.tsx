import * as engine from "@teambench/engine";
import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { posAbbr } from "../team/positions";
import type { PlayerRow } from "../team/usePlayers";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
  matchId: string;
  onClose: () => void;
  ourLabel: string;
}

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

export function MatchSummary({ live, roster, opponent, matchId, onClose, ourLabel }: Props) {
  const { state } = live;
  const players = roster.map(toEnginePlayer);
  const byId = (id: string) => players.find((p) => p.id === id);
  const nowMs = Date.now();

  const convocados = players.filter((p) => state.convocadoIds.includes(p.id));
  const rows = engine.buildRows({ convocados, titularIds: state.titularIds, events: state.events, clock: state.clockAcc, nowMs });

  const [copyMsg, setCopyMsg] = useState("");
  const [finishStatus, setFinishStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function handleCopy() {
    const text = engine.exportText(rows, state.events, state.score, byId);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copiado! Cola no Excel/Sheets do clube.");
    } catch {
      setCopyMsg("Não copiou automaticamente — copie manualmente do texto abaixo.");
    }
  }

  function handleDownloadTimeline() {
    const halves = engine.buildTimelineData(state.events, players, state.titularIds);
    const html = engine.buildTimelineHtml({ adversario: opponent }, halves, state.score.nos, state.score.advers, byId);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeline_${(opponent ?? "jogo").replace(/\s+/g, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function handleFinish() {
    setFinishStatus("saving");
    const { error } = await supabase.from("matches").update({ status: "finished" }).eq("id", matchId);
    setFinishStatus(error ? "error" : "done");
  }

  return (
    <div>
      <button type="button" className="btn sm ghost" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Voltar ao jogo
      </button>
      <h2 style={{ fontSize: 18 }}>Resumo — vs {opponent}</h2>
      <p className="hint" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
        {ourLabel} {state.score.nos} – {state.score.advers} {opponent}
      </p>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Atleta</th>
              <th className="num">Conv.</th>
              <th className="num">Tit.</th>
              <th className="num">Min</th>
              <th className="num">G</th>
              <th className="num">A</th>
              <th className="num">CA</th>
              <th className="num">CV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId}>
                <td>#{r.num} {r.nome}</td>
                <td className="num">{r.convocado}</td>
                <td className="num">{r.titular}</td>
                <td className="num">{r.min}</td>
                <td className="num">{r.golos}</td>
                <td className="num">{r.assist}</td>
                <td className="num">{r.ca}</td>
                <td className="num">{r.cv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={handleCopy}>📋 Copiar resumo</button>
        <button type="button" className="btn" onClick={handleDownloadTimeline}>🗓️ Descarregar timeline</button>
        <button type="button" className="btn primary" onClick={handleFinish} disabled={finishStatus === "saving" || finishStatus === "done"}>
          {finishStatus === "done" ? "✅ Jogo terminado" : "Marcar jogo como terminado"}
        </button>
      </div>
      {copyMsg && <p className="hint">{copyMsg}</p>}
      {finishStatus === "error" && <p className="banner error">Não consegui marcar como terminado — tente de novo.</p>}

      <div style={{ marginTop: 16 }}>
        <h3 className="section-title">Registo cronológico ({state.events.length})</h3>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {state.events.map((e) => (
            <div key={e.id} className="logline">
              <span className="d">{engine.describeEvent(e, byId)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        A tabela de posições/nomes usa o registo local deste telemóvel. O que já sincronizou também está guardado no Supabase (tabela match_events).
      </p>
    </div>
  );
}
