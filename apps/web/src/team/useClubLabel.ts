import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

const FALLBACK = "Nós";

/**
 * Rótulo do clube (sigla/nome curto se definido, senão o nome completo) para
 * usar no jogo ao vivo em vez de "Nós" fixo — o app serve vários clubes.
 * Funciona para qualquer membro da equipa (não só quem administra o clube):
 * team_club_label() é SECURITY DEFINER porque um Lançador de dados convidado
 * só para a equipa nunca é club_member, e não teria como ler `clubs`
 * diretamente.
 */
export function useClubLabel(teamId: string): string {
  const [label, setLabel] = useState(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("team_club_label", { p_team_id: teamId })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setLabel(data as string);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return label;
}
