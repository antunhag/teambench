import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { traduzirErro } from "../errorMessage";
import { supabase } from "../supabaseClient";

export interface CurrentClub {
  clubId: string;
  clubName: string;
  clubShortName: string | null;
}

type Status = "loading" | "no-club" | "has-club" | "error";

/** Descobre se o usuário logado já administra um clube (via club_members). */
export function useCurrentClub(session: Session | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [club, setClub] = useState<CurrentClub | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Já houve uma leitura com sucesso? A releitura (ex.: renovação da sessão,
  // que muda o objeto `session`) não volta a mostrar "A carregar…" nem troca
  // a app por um erro — isso desmontava um jogo ao vivo aberto.
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus("no-club");
      setClub(null);
      return;
    }
    if (!loadedRef.current) setStatus("loading");
    const { data, error } = await supabase
      .from("club_members")
      .select("clubs(id, name, short_name)")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (loadedRef.current) return;
      setStatus("error");
      setErrorMessage(traduzirErro(error.message));
      return;
    }
    loadedRef.current = true;
    if (!data || !data.clubs) {
      setStatus("no-club");
      setClub(null);
      return;
    }
    const clubRow = Array.isArray(data.clubs) ? data.clubs[0] : data.clubs;
    setClub({ clubId: clubRow.id, clubName: clubRow.name, clubShortName: clubRow.short_name });
    setStatus("has-club");
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, club, errorMessage, refresh };
}
