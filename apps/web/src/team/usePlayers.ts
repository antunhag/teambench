import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { parseRosterImport, type ExistingPlayer } from "./rosterImport";
import type { Position } from "./positions";

export interface PlayerRow {
  id: string;
  num: string | null;
  name: string;
  position: Position | null;
  active: boolean;
}

export function usePlayers(teamId: string) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase
      .from("players")
      .select("id, number, name, position, active")
      .eq("team_id", teamId)
      .eq("active", true)
      .order("number", { ascending: true, nullsFirst: false });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setPlayers(
      (data ?? []).map((p) => ({ id: p.id, num: p.number, name: p.name, position: p.position as Position, active: p.active }))
    );
    setStatus("ready");
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addPlayer(num: string, name: string, position: Position) {
    const { error } = await supabase
      .from("players")
      .insert({ id: crypto.randomUUID(), team_id: teamId, number: num, name, position });
    if (error) throw error;
    await refresh();
  }

  async function deactivatePlayer(id: string) {
    const { error } = await supabase.from("players").update({ active: false }).eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function bulkImport(text: string) {
    const existing: ExistingPlayer[] = players.map((p) => ({ id: p.id, num: p.num, name: p.name }));
    const result = parseRosterImport(text, teamId, existing);
    if (result.upserts.length > 0) {
      const { error } = await supabase.from("players").upsert(result.upserts, { onConflict: "id" });
      if (error) throw error;
      await refresh();
    }
    return result;
  }

  return { players, status, errorMessage, addPlayer, deactivatePlayer, bulkImport, refresh };
}
