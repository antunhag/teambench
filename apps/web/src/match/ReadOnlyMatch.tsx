import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { isGoalkeeper, posAbbr } from "../team/positions";
import type { PlayerRow } from "../team/usePlayers";

interface Props {
  matchId: string;
  opponent: string | null;
  roster: PlayerRow[];
  format?: engine.MatchFormat;
  ourLabel: string;
}

const POLL_MS = 5_000;

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

/**
 * Vista de acompanhamento em tempo real para quem NÃO segura a trava deste
 * jogo (ver useMatchLock) — mostra placar, faltas, tempo em quadra e registo
 * cronológico a partir do que já sincronizou, sem tocar em
 * localStorage/outbox: quem só está a ver não deve interferir com o registo
 * de quem está a jogar em campo.
 */
export function ReadOnlyMatch({ matchId, opponent, roster, format, ourLabel }: Props) {
  const [events, setEvents] = useState<engine.MatchEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [showLog, setShowLog] = useState(false);

  const players = roster.map(toEnginePlayer);
  const byId = (id: string) => players.find((p) => p.id === id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("match_events")
        .select("payload")
        .eq("match_id", matchId)
        .order("period", { ascending: true })
        .order("ms", { ascending: true });
      if (cancelled) return;
      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }
      setEvents((data ?? []).map((row) => row.payload as engine.MatchEvent));
      setStatus("ready");
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchId]);

  if (status === "loading") return <p className="empty">A carregar jogo...</p>;
  if (status === "error") return <p className="banner error">Erro: {errorMessage}</p>;

  const score = engine.recomputeScoreFor(events);
  // Não há LiveMatchState aqui (só os eventos já sincronizados) — a parte
  // atual é a maior já vista; faltas por período dá pra contar direto.
  const currentPeriod = events.reduce((max, e) => Math.max(max, e.period), 1);
  const fouls = engine.foulsInPeriod(events, currentPeriod);
  const timeoutNosUsed = engine.timeoutUsedInPeriod(events, currentPeriod, "tempo_nos");
  const timeoutAdversUsed = engine.timeoutUsedInPeriod(events, currentPeriod, "tempo_advers");

  // Tempo em quadra por atleta, reconstruído só dos eventos sincronizados —
  // os titulares da parte 1 vêm do lineup gravado no primeiro kickoff (ver
  // titularIdsFromEvents); sem golos no jogo não haveria outra forma de
  // saber quem começou em campo.
  const titularIds = engine.titularIdsFromEvents(events);
  const halves = engine.buildTimelineData(events, players, titularIds);
  const secondsById = new Map<string, number>();
  halves.forEach((h) => h.players.forEach((p) => secondsById.set(p.id, (secondsById.get(p.id) ?? 0) + p.totalSec)));
  const minutesRows = [...secondsById.entries()]
    .map(([id, sec]) => ({ player: byId(id), sec }))
    .filter((r): r is { player: engine.Player; sec: number } => !!r.player)
    .sort((a, b) => b.sec - a.sec);

  return (
    <div>
      <div className="banner warn">
        <strong>Modo leitura</strong> — outra pessoa já está a registar este jogo. Acompanhe aqui em tempo real; para
        editar, aguarde essa pessoa terminar ou libertar o jogo.
      </div>

      <h2 style={{ fontSize: 18 }}>vs {opponent}</h2>
      <div className="scoreboard" style={{ flexDirection: "column" }}>
        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="score-side">
            <div className="lbl">{ourLabel}</div>
            <div className="val">{score.nos}</div>
          </div>
          <div className="score-side">
            <div className="lbl">{opponent || "Advers."}</div>
            <div className="val">{score.advers}</div>
          </div>
        </div>
        <div className="scoreboard-timeouts" style={{ width: "100%" }}>
          <div className="timeout-box">
            <span className="lbl">Timeout</span>
            <span className="box">{timeoutNosUsed ? 1 : 0}</span>
          </div>
          <div className="timeout-box">
            <span className="lbl">Timeout</span>
            <span className="box">{timeoutAdversUsed ? 1 : 0}</span>
          </div>
        </div>
        <div className="scoreboard-fouls">
          <div className={`foul${fouls.nos >= 5 ? " warn" : ""}`}>
            Faltas {ourLabel}
            <span className="n">{fouls.nos}</span>
          </div>
          <div className={`foul${fouls.advers >= 5 ? " warn" : ""}`}>
            Faltas advers.
            <span className="n">{fouls.advers}</span>
          </div>
        </div>
      </div>

      {minutesRows.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 16 }}>Tempo em quadra</h3>
          <div className="pgrid">
            {minutesRows.map(({ player, sec }) => (
              <div key={player.id} className={`pchip${isGoalkeeper(player.pos) ? " gr" : ""}`} style={{ cursor: "default" }}>
                <span className="min">{Math.floor(sec / 60)}'</span>
                <span className="n">#{player.num}</span>
                <span className="nm">{player.name}</span>
                <span className="pos">{posAbbr(player.pos)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <button type="button" className="btn sm ghost" onClick={() => setShowLog((v) => !v)} style={{ marginTop: 16 }}>
        {showLog ? "Ocultar" : "Ver"} registo cronológico ({events.length})
      </button>
      {showLog && (
        <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
          {events.map((e) => (
            <div key={e.clientEventId ?? e.id} className="logline">
              <span className="d">{engine.describeEvent(e, byId, format)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
