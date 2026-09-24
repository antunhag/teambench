import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import type { PlayerRow } from "../team/usePlayers";

interface Props {
  matchId: string;
  opponent: string | null;
  roster: PlayerRow[];
  format?: engine.MatchFormat;
}

const POLL_MS = 5_000;

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

/**
 * Vista de acompanhamento em tempo real para quem NÃO segura a trava deste
 * jogo (ver useMatchLock) — mostra placar e registo cronológico a partir do
 * que já sincronizou, sem tocar em localStorage/outbox: quem só está a ver
 * não deve interferir com o registo de quem está a jogar em campo.
 */
export function ReadOnlyMatch({ matchId, opponent, roster, format }: Props) {
  const [events, setEvents] = useState<engine.MatchEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

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

  return (
    <div>
      <div className="banner warn">
        <strong>Modo leitura</strong> — outra pessoa já está a registar este jogo. Acompanhe aqui em tempo real; para
        editar, aguarde essa pessoa terminar ou libertar o jogo.
      </div>

      <h2 style={{ fontSize: 18 }}>vs {opponent}</h2>
      <div className="scoreboard">
        <div className="score-side">
          <div className="lbl">Nós</div>
          <div className="val">{score.nos}</div>
        </div>
        <div className="score-side">
          <div className="lbl">{opponent || "Advers."}</div>
          <div className="val">{score.advers}</div>
        </div>
      </div>

      <h3 className="section-title" style={{ marginTop: 16 }}>Registo cronológico ({events.length})</h3>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {events.map((e) => (
          <div key={e.clientEventId ?? e.id} className="logline">
            <span className="d">{engine.describeEvent(e, byId, format)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
