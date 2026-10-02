import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { posAbbr } from "../team/positions";
import type { PlayerRow } from "../team/usePlayers";
import type { useLiveMatch } from "./useLiveMatch";
import { useRotationPlan } from "./useRotationPlan";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
  matchId: string;
  teamId: string;
  onClose: () => void;
  ourLabel: string;
}

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

/**
 * Junta o que já sincronizou (Supabase — pode incluir correções feitas de
 * outro aparelho via "Corrigir registo", inclusive em eventos já existentes)
 * com o que ainda só existe neste aparelho (outbox por sincronizar). O
 * servidor manda em qualquer evento que já tenha lá — é ele quem carrega a
 * versão corrigida; só entra da lista local quem ainda não tem na fila.
 */
function mergeEvents(local: engine.MatchEvent[], remote: engine.MatchEvent[]): engine.MatchEvent[] {
  const remoteIds = new Set(remote.map((e) => e.clientEventId ?? e.id));
  const localOnly = local.filter((e) => !remoteIds.has(e.clientEventId ?? e.id));
  return [...remote, ...localOnly];
}

export function MatchSummary({ live, roster, opponent, matchId, teamId, onClose, ourLabel }: Props) {
  const players = roster.map(toEnginePlayer);
  const byId = (id: string) => players.find((p) => p.id === id);

  // Tempo em quadra e placar são recalculados a partir do registo mais
  // completo que der pra reunir (Supabase + o que falta sincronizar), nunca
  // só do que este aparelho acumulou ao vivo — uma substituição corrigida
  // depois (de outro aparelho, ou via "Corrigir registo") muda quem estava
  // em quadra e por quanto tempo em TODOS os lances daquele ponto em diante,
  // não só no lance mais próximo. Sem rede, cai de volta pro que já se tinha
  // (o jogo continua funcionando offline; só o "conferir depois" precisa de
  // rede pra pegar correções feitas noutro aparelho).
  const [remoteEvents, setRemoteEvents] = useState<engine.MatchEvent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("match_events")
      .select("payload")
      .eq("match_id", matchId)
      .order("period", { ascending: true })
      .order("ms", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setRemoteEvents(data.map((row) => row.payload as engine.MatchEvent));
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const effectiveEvents = remoteEvents ? mergeEvents(live.state.events, remoteEvents) : live.state.events;
  const state = remoteEvents ? engine.replayEvents(live.state.convocadoIds, effectiveEvents, live.format) : live.state;
  // NUNCA usar Date.now() cru aqui: um estado reconstruído por replay (ver
  // replayEvents) nunca ancora o relógio no tempo real — "agora" nesse caso
  // é sempre o clock.elapsedMs interno do próprio estado (matchElapsedMs já
  // resolve isso certo pros dois casos, ao vivo ou reconstruído). Usar
  // Date.now() direto aqui já causou uma vez minutos absurdos (a diferença
  // entre uma marca de tempo em ms-de-jogo e a época real, em milissegundos).
  const nowMs = engine.matchElapsedMs(state, Date.now());

  const convocados = players.filter((p) => state.convocadoIds.includes(p.id));
  const rows = engine.buildRows({ convocados, titularIds: state.titularIds, events: state.events, clock: state.clockAcc, nowMs });

  // Mesmos dados da timeline (já corrigidos pra usar o kickoff de cada parte,
  // não só quem sobrou da parte anterior) — reaproveitados aqui pra abrir o
  // total em minutos por parte, sem duplicar a lógica de quem esteve em
  // quadra quando. Guarda segundos exatos, não minutos já arredondados: exibir
  // em mm:ss (ver render abaixo) é o que garante que a soma das partes bate
  // com o total — arredondar cada parte pra minuto inteiro por separado podia
  // dar, por exemplo, 20'+20'=40' com o total mostrando 39'.
  const halves = engine.buildTimelineData(state.events, players, state.titularIds);
  const secsByPlayerHalf = new Map<string, number[]>();
  halves.forEach((half, i) => {
    half.players.forEach((p) => {
      const arr = secsByPlayerHalf.get(p.id) || halves.map(() => 0);
      arr[i] = p.totalSec || 0;
      secsByPlayerHalf.set(p.id, arr);
    });
  });
  function halfShortLabel(label: string): string {
    if (label.endsWith(" Parte")) return label.replace(" Parte", "");
    return label.replace("Prolongamento ", "Prol.");
  }

  // Plano de rotação (se houver) — nunca escreve nada aqui, só compara o
  // previsto (planeado antes do jogo) contra o real (já calculado acima a
  // partir dos eventos). "Sem plano" é normal, não mostra nada extra.
  const rotationPlan = useRotationPlan(teamId, matchId);
  const plannedTotalByPlayer = engine.plannedSecondsByPlayer(rotationPlan.stints);
  const hasRotationPlan = rotationPlan.stints.length > 0;

  const [copyMsg, setCopyMsg] = useState("");
  const [finishStatus, setFinishStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function handleCopy() {
    const text = engine.exportText(rows, state.events, state.score, byId, live.format, ourLabel, opponent);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copiado! Cola no Excel/Sheets do clube.");
    } catch {
      setCopyMsg("Não copiou automaticamente — copie manualmente do texto abaixo.");
    }
  }

  function handleDownloadTimeline() {
    const html = engine.buildTimelineHtml({ adversario: opponent, ourLabel }, halves, state.score.nos, state.score.advers, byId);
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
              {halves.map((h, i) => (
                <th key={i} className="num" title={h.label}>{halfShortLabel(h.label)}</th>
              ))}
              <th className="num">Total</th>
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
                {(secsByPlayerHalf.get(r.playerId) || halves.map(() => 0)).map((sec, i) => (
                  <td key={i} className="num">{engine.fmtMinSec(sec * 1000)}</td>
                ))}
                <td className="num">
                  {engine.fmtMinSec((secsByPlayerHalf.get(r.playerId) || []).reduce((a, b) => a + b, 0) * 1000)}
                </td>
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

      {hasRotationPlan && (
        <div style={{ marginTop: 16 }}>
          <h3 className="section-title">Planeado vs. Real</h3>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th className="num">Planeado</th>
                  <th className="num">Real</th>
                  <th className="num">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const plannedSec = plannedTotalByPlayer[r.playerId] ?? 0;
                  const realSec = (secsByPlayerHalf.get(r.playerId) || []).reduce((a, b) => a + b, 0);
                  const diffSec = realSec - plannedSec;
                  if (plannedSec === 0 && realSec === 0) return null;
                  return (
                    <tr key={r.playerId}>
                      <td>#{r.num} {r.nome}</td>
                      <td className="num">{engine.fmtMinSec(plannedSec * 1000)}</td>
                      <td className="num">{engine.fmtMinSec(realSec * 1000)}</td>
                      <td className="num">
                        {diffSec > 0 ? "+" : diffSec < 0 ? "−" : ""}
                        {engine.fmtMinSec(Math.abs(diffSec) * 1000)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3 className="section-title">Registo cronológico ({state.events.length})</h3>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {(() => {
            // "Em quadra" recalculado do zero (ver describeEvents) — nunca lido do
            // valor gravado no golo, que fica velho se uma substituição for
            // corrigida depois com um tempo anterior ao golo.
            const descriptions = engine.describeEvents(state.events, byId);
            return state.events.map((e) => (
              <div key={e.id} className="logline">
                <span className="d">{descriptions.get(e.id)}</span>
              </div>
            ));
          })()}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        {remoteEvents
          ? "Minutos e placar já incluem qualquer correção feita depois (noutro aparelho ou em \"Corrigir registo\")."
          : "Sem rede agora — mostrando o que este aparelho já tem registado; correções feitas noutro aparelho só aparecem quando a rede voltar."}
      </p>
    </div>
  );
}
