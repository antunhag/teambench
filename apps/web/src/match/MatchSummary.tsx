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
}

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

export function MatchSummary({ live, roster, opponent, matchId, onClose }: Props) {
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
      <button type="button" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Voltar ao jogo
      </button>
      <h2 style={{ fontSize: 16 }}>Resumo — vs {opponent}</h2>
      <p style={{ color: "#666" }}>
        Nós {state.score.nos} – {state.score.advers} {opponent}
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#666", fontSize: 11 }}>
            <th>Atleta</th>
            <th>Conv.</th>
            <th>Tit.</th>
            <th>Min</th>
            <th>G</th>
            <th>A</th>
            <th>CA</th>
            <th>CV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} style={{ borderTop: "1px solid #eee" }}>
              <td>#{r.num} {r.nome}</td>
              <td>{r.convocado}</td>
              <td>{r.titular}</td>
              <td>{r.min}</td>
              <td>{r.golos}</td>
              <td>{r.assist}</td>
              <td>{r.ca}</td>
              <td>{r.cv}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={handleCopy}>📋 Copiar resumo</button>
        <button type="button" onClick={handleDownloadTimeline}>🗓️ Descarregar timeline</button>
        <button type="button" onClick={handleFinish} disabled={finishStatus === "saving" || finishStatus === "done"}>
          {finishStatus === "done" ? "✅ Jogo terminado" : "Marcar jogo como terminado"}
        </button>
      </div>
      {copyMsg && <p style={{ fontSize: 12, color: "#666" }}>{copyMsg}</p>}
      {finishStatus === "error" && <p style={{ color: "crimson", fontSize: 12 }}>Não consegui marcar como terminado — tente de novo.</p>}

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14 }}>Registo cronológico ({state.events.length})</h3>
        <div style={{ maxHeight: 240, overflowY: "auto", fontSize: 12 }}>
          {state.events.map((e) => (
            <div key={e.id} style={{ borderTop: "1px solid #eee", padding: "4px 0" }}>
              {engine.describeEvent(e, byId)}
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>
        A tabela de posições/nomes usa o registo local deste telemóvel. O que já sincronizou também está guardado no Supabase (tabela match_events).
      </p>
    </div>
  );
}
