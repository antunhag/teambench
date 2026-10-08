import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { parseRosterImport, type ExistingPlayer } from "./rosterImport";
import type { Position } from "./positions";

/** Estado do atleta — informação sobre ele, não sobre um jogo isolado (ver specs/003-data-driven-rotation/). "indisponivel" só reverte quando o treinador marca "apto" de novo; "a_retomar" reverte sozinho ao guardar um plano de rotação que o inclua. */
export type AvailabilityStatus = "apto" | "a_retomar" | "indisponivel";

export interface PlayerRow {
  id: string;
  num: string | null;
  name: string;
  position: Position | null;
  active: boolean;
  availabilityStatus: AvailabilityStatus;
  availabilityNote: string | null;
}

export function usePlayers(teamId: string) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    // Traz ativos e inativos juntos — o cadastro precisa mostrar quem foi
    // removido para poder reativar (nunca se apaga um atleta de verdade).
    const { data, error } = await supabase
      .from("players")
      .select("id, number, name, position, active, availability_status, availability_note")
      .eq("team_id", teamId)
      .order("number", { ascending: true, nullsFirst: false });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setPlayers(
      (data ?? []).map((p) => ({
        id: p.id,
        num: p.number,
        name: p.name,
        position: p.position as Position,
        active: p.active,
        availabilityStatus: (p.availability_status as AvailabilityStatus) ?? "apto",
        availabilityNote: p.availability_note,
      }))
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

  async function updatePlayer(id: string, fields: { num: string; name: string; position: Position }) {
    const { error } = await supabase
      .from("players")
      .update({ number: fields.num, name: fields.name, position: fields.position })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function deactivatePlayer(id: string) {
    const { error } = await supabase.from("players").update({ active: false }).eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function reactivatePlayer(id: string) {
    const { error } = await supabase.from("players").update({ active: true }).eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function setAvailability(id: string, status: AvailabilityStatus, note: string | null) {
    const { error } = await supabase
      .from("players")
      .update({ availability_status: status, availability_note: note })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function bulkImport(text: string) {
    const existing: ExistingPlayer[] = players.filter((p) => p.active).map((p) => ({ id: p.id, num: p.num, name: p.name }));
    const result = parseRosterImport(text, teamId, existing);
    if (result.upserts.length > 0) {
      const { error } = await supabase.from("players").upsert(result.upserts, { onConflict: "id" });
      if (error) throw error;
      await refresh();
    }
    return result;
  }

  return { players, status, errorMessage, addPlayer, updatePlayer, deactivatePlayer, reactivatePlayer, setAvailability, bulkImport, refresh };
}
