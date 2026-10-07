import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

export type TeamRole = "team_admin" | "data_entry" | "viewer";

export interface UserTeam {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

type Status = "loading" | "no-team" | "has-team" | "error";

const STORAGE_KEY = "teambench.selectedTeamId";
const REFRESH_INTERVAL_MS = 20_000;

function readStoredTeamId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTeamId(teamId: string | null) {
  try {
    if (teamId) localStorage.setItem(STORAGE_KEY, teamId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage indisponível — a seleção ainda funciona nesta sessão, só não sobrevive a um F5/reabrir.
  }
}

/**
 * Carrega TODAS as equipas a que o utilizador pertence (substitui
 * useCurrentTeam.ts, que só carregava uma — ver Decisão 2 do research.md da
 * spec 002-multi-team-navigation) e gere qual delas está selecionada.
 *
 * A última equipa selecionada fica em localStorage, por aparelho (Decisão
 * 3) — nunca sincronizada entre aparelhos. Reconsulta a lista num intervalo
 * (mesma ordem de grandeza do heartbeat de 20s já usado em
 * useResourceLock.ts) e ao recuperar o foco da janela, pra detetar perda de
 * acesso à equipa selecionada a meio da sessão (FR-007, Decisão 5) — este
 * projeto não usa Supabase Realtime em nenhum outro ponto.
 */
export function useUserTeams(session: Session | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [teams, setTeams] = useState<UserTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [lostAccessWarning, setLostAccessWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!session) {
      setStatus("no-team");
      setTeams([]);
      setSelectedTeamId(null);
      return;
    }

    const { data, error } = await supabase
      .from("team_members")
      .select("role, teams(id, name)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    type Row = { role: TeamRole; teams: { id: string; name: string } | { id: string; name: string }[] | null };
    const loaded: UserTeam[] = ((data ?? []) as Row[])
      .filter((row) => row.teams)
      .map((row) => {
        const teamRow = Array.isArray(row.teams) ? row.teams[0] : row.teams!;
        return { teamId: teamRow.id, teamName: teamRow.name, role: row.role };
      });

    setTeams(loaded);

    setSelectedTeamId((prev) => {
      const current = prev ?? readStoredTeamId();
      const stillValid = !!current && loaded.some((t) => t.teamId === current);
      if (stillValid) return current;

      // A seleção já ativa NESTA sessão deixou de ser válida (removido, ou a
      // equipa/clube desapareceu) — avisar, nunca só trocar em silêncio.
      // Uma seleção vinda só do localStorage (prev ainda null, primeiro
      // carregamento) não conta como "perda a meio da sessão".
      if (prev) setLostAccessWarning(true);

      const fallback = loaded[0]?.teamId ?? null;
      writeStoredTeamId(fallback);
      return fallback;
    });

    setStatus(loaded.length > 0 ? "has-team" : "no-team");
  }, [session]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    writeStoredTeamId(teamId);
    setLostAccessWarning(false);
  }

  function dismissLostAccessWarning() {
    setLostAccessWarning(false);
  }

  const selectedTeam = teams.find((t) => t.teamId === selectedTeamId) ?? null;

  return { status, teams, selectedTeam, selectTeam, lostAccessWarning, dismissLostAccessWarning, errorMessage, refresh };
}
