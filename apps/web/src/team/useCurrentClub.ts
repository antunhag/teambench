import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

export interface CurrentClub {
  clubId: string;
  clubName: string;
}

type Status = "loading" | "no-club" | "has-club" | "error";

/** Descobre se o usuário logado já administra um clube (via club_members). */
export function useCurrentClub(session: Session | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [club, setClub] = useState<CurrentClub | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus("no-club");
      setClub(null);
      return;
    }
    setStatus("loading");
    const { data, error } = await supabase
      .from("club_members")
      .select("clubs(id, name)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    if (!data || !data.clubs) {
      setStatus("no-club");
      setClub(null);
      return;
    }
    const clubRow = Array.isArray(data.clubs) ? data.clubs[0] : data.clubs;
    setClub({ clubId: clubRow.id, clubName: clubRow.name });
    setStatus("has-club");
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, club, errorMessage, refresh };
}
