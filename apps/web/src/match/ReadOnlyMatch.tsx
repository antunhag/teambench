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

  if (status === "loading") return <p>A carregar jogo...</p>;
  if (status === "error") return <p style={{ color: "crimson" }}>Erro: {errorMessage}</p>;

  const score = engine.recomputeScoreFor(events);

  return (
    <div>
      <div style={{ border: "1px solid #a60", borderRadius: 8, padding: 10, marginBottom: 12, background: "#fff8ec" }}>
        <strong>Modo leitura</strong> — outra pessoa já está a registar este jogo. Acompanhe aqui em tempo real; para
        editar, aguarde essa pessoa terminar ou libertar o jogo.
      </div>

      <h2 style={{ fontSize: 16 }}>vs {opponent}</h2>
      <p style={{ fontSize: 20, fontWeight: 700 }}>
        Nós {score.nos} – {score.advers} {opponent}
      </p>

      <h3 style={{ fontSize: 14, marginTop: 16 }}>Registo cronológico ({events.length})</h3>
      <div style={{ maxHeight: 320, overflowY: "auto", fontSize: 12 }}>
        {events.map((e) => (
          <div key={e.clientEventId ?? e.id} style={{ borderTop: "1px solid #eee", padding: "4px 0" }}>
            {engine.describeEvent(e, byId, format)}
          </div>
        ))}
      </div>
    </div>
  );
}
