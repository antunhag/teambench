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

/** Gestão de quem tem acesso à equipa: membros já aceites + convites pendentes. */
export function useTeamMembers(teamId: string) {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [invites, setInvites] = useState<PendingInviteRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setStatus("loading");

    const [membersRes, invitesRes] = await Promise.all([
      supabase.rpc("list_team_members_with_email", { p_team_id: teamId }),
      supabase
        .from("invites")
        .select("id, email, role, token, expires_at")
        .eq("team_id", teamId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
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

  return { members, invites, status, errorMessage, createInvite, revokeInvite, removeMember, refresh };
}

export function inviteLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}
