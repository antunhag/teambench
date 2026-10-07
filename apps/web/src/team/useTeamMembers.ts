import { useCallback, useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

export type TeamRole = "team_admin" | "data_entry" | "viewer";

export interface TeamMemberRow {
  id: string;
  userId: string;
  email: string;
  role: TeamRole;
}

export interface PendingInviteRow {
  id: string;
  email: string;
  role: TeamRole;
  token: string;
  expiresAt: string;
}

export interface AccessLogRow {
  id: string;
  eventType: "granted" | "revoked";
  role: TeamRole;
  targetEmail: string;
  /** null quando o acesso foi concedido via aceite de convite — não há um "admin agindo" nesse instante, ver migração 0017. */
  actorEmail: string | null;
  createdAt: string;
}

/** Gestão de quem tem acesso à equipa: membros já aceites + convites pendentes + histórico. */
export function useTeamMembers(teamId: string) {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invites, setInvites] = useState<PendingInviteRow[]>([]);
  const [accessLog, setAccessLog] = useState<AccessLogRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");

    const [membersRes, invitesRes, accessLogRes] = await Promise.all([
      supabase.rpc("list_team_members_with_email", { p_team_id: teamId }),
      supabase
        .from("invites")
        .select("id, email, role, token, expires_at")
        .eq("team_id", teamId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      supabase.rpc("list_team_access_log", { p_team_id: teamId }),
    ]);

    if (membersRes.error) {
      setStatus("error");
      setErrorMessage(membersRes.error.message);
      return;
    }
    if (invitesRes.error) {
      setStatus("error");
      setErrorMessage(invitesRes.error.message);
      return;
    }
    // O histórico (migração 0017) é mais recente que o resto desta tela —
    // se ainda não foi aplicado no Supabase, falha em silêncio (fica vazio)
    // em vez de derrubar a tela inteira de Acesso à Equipa por causa dele.
    if (accessLogRes.error) {
      setAccessLog([]);
    } else {
      type AccessLogRes = {
        id: string;
        event_type: "granted" | "revoked";
        role: TeamRole;
        target_email: string;
        actor_email: string | null;
        created_at: string;
      };
      setAccessLog(
        ((accessLogRes.data ?? []) as AccessLogRes[]).map((l) => ({
          id: l.id,
          eventType: l.event_type,
          role: l.role,
          targetEmail: l.target_email,
          actorEmail: l.actor_email,
          createdAt: l.created_at,
        }))
      );
    }

    type MemberRow = { id: string; user_id: string; email: string; role: TeamRole };
    setMembers(
      ((membersRes.data ?? []) as MemberRow[]).map((m) => ({ id: m.id, userId: m.user_id, email: m.email, role: m.role }))
    );
    setInvites(
      (invitesRes.data ?? [])
        .filter((i) => new Date(i.expires_at).getTime() > Date.now())
        .map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, expiresAt: i.expires_at }))
    );
    setStatus("ready");
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createInvite(email: string, role: TeamRole): Promise<string> {
    const { data, error } = await supabase
      .from("invites")
      .insert({ team_id: teamId, email, role })
      .select("token")
      .single();
    if (error) throw error;
    await refresh();
    return data.token as string;
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("invites").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function removeMember(id: string) {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) throw error;
    await refresh();
  }

  async function changeRole(id: string, role: TeamRole) {
    const { error } = await supabase.from("team_members").update({ role }).eq("id", id);
    if (error) throw error;
    await refresh();
  }

  return { members, invites, accessLog, status, errorMessage, createInvite, revokeInvite, removeMember, changeRole, refresh };
}

export function inviteLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}
