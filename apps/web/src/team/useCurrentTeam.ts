import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

export interface CurrentTeam {
  teamId: string;
  teamName: string;
  role: "team_admin" | "data_entry" | "viewer";
}

type Status = "loading" | "no-team" | "has-team" | "error";

/**
 * Descobre se o usuário logado já pertence a uma equipa (via team_members).
 * Por agora assume no máximo uma equipa por usuário — trocar de equipa é
 * uma funcionalidade da Fase 3 (auto-cadastro multi-equipa).
 */
export function useCurrentTeam(session: Session | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [team, setTeam] = useState<CurrentTeam | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus("no-team");
      setTeam(null);
      return;
    }
    setStatus("loading");
    const { data, error } = await supabase
      .from("team_members")
      .select("role, teams(id, name)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    if (!data || !data.teams) {
      setStatus("no-team");
      setTeam(null);
      return;
    }
    const teamRow = Array.isArray(data.teams) ? data.teams[0] : data.teams;
    setTeam({ teamId: teamRow.id, teamName: teamRow.name, role: data.role });
    setStatus("has-team");
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, team, errorMessage, refresh };
}
