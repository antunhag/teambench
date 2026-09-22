import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { parseMatchImport, type ExistingMatch } from "./matchImport";

export interface MatchRow {
  id: string;
  matchDate: string;
  opponent: string | null;
  competition: string | null;
  location: string | null;
  kickoffTime: string | null;
  formatId: string | null;
  status: string;
}

export interface MatchFields {
  matchDate: string; // ISO yyyy-mm-dd
  opponent: string;
  competition: string | null;
  location: string | null;
  kickoffTime: string | null;
  formatId: string | null;
}

export function useMatches(teamId: string) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase
      .from("matches")
      .select("id, match_date, opponent, competition, location, kickoff_time, format_id, status")
      .eq("team_id", teamId)
      .order("match_date", { ascending: true });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setMatches(
      (data ?? []).map((m) => ({
        id: m.id,
        matchDate: m.match_date,
        opponent: m.opponent,
        competition: m.competition,
        location: m.location,
        kickoffTime: m.kickoff_time,
        formatId: m.format_id,
        status: m.status,
      }))
    );
    setStatus("ready");
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createMatch(fields: MatchFields) {
    const { error } = await supabase.from("matches").insert({
      id: crypto.randomUUID(),
      team_id: teamId,
      match_date: fields.matchDate,
      opponent: fields.opponent,
      competition: fields.competition,
      location: fields.location,
      kickoff_time: fields.kickoffTime,
      format_id: fields.formatId,
    });
    if (error) throw error;
    await refresh();
  }

  async function updateMatch(id: string, fields: MatchFields) {
    const { error } = await supabase
      .from("matches")
      .update({
        match_date: fields.matchDate,
        opponent: fields.opponent,
        competition: fields.competition,
        location: fields.location,
        kickoff_time: fields.kickoffTime,
        format_id: fields.formatId,
      })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function deleteMatch(id: string) {
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function bulkImport(text: string, defaultFormatId: string | null) {
    const existing: ExistingMatch[] = matches.map((m) => ({
      id: m.id,
      matchDate: m.matchDate,
      opponent: m.opponent,
      formatId: m.formatId,
    }));
    const result = parseMatchImport(text, teamId, defaultFormatId, existing);
    if (result.upserts.length > 0) {
      const { error } = await supabase.from("matches").upsert(result.upserts, { onConflict: "id" });
      if (error) throw error;
      await refresh();
    }
    return result;
  }

  return { matches, status, errorMessage, createMatch, updateMatch, deleteMatch, bulkImport, refresh };
}
