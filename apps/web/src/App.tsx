import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "preact/hooks";
import { AcceptInvite } from "./team/AcceptInvite";
import { Login } from "./auth/Login";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { MatchFlow } from "./match/MatchFlow";
import { Calendar } from "./team/Calendar";
import { ClubSettings } from "./team/ClubSettings";
import { CreateClub } from "./team/CreateClub";
import { CreateTeam } from "./team/CreateTeam";
import { MatchFormats } from "./team/MatchFormats";
import { Roster } from "./team/Roster";
import { TeamMembers } from "./team/TeamMembers";
import { useCurrentClub } from "./team/useCurrentClub";
import { useCurrentTeam, type CurrentTeam } from "./team/useCurrentTeam";
import { useOutboxSync } from "./sync/useOutboxSync";

const ROLE_LABELS: Record<string, string> = {
  team_admin: "Admin da Equipa",
  data_entry: "Lançador de dados",
  viewer: "Visualizador",
};

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = ainda a carregar

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="page">
        <h1 style={{ fontSize: 20 }}>Teambench</h1>
        <p>
          Falta configurar a ligação ao Supabase. Copie <code>apps/web/.env.example</code> para{" "}
          <code>apps/web/.env.local</code> e preencha <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> com os valores de Project Settings → API, depois recarregue esta página.
        </p>
      </div>
    );
  }

  if (session === undefined) {
    return <p className="empty">A carregar...</p>;
  }

  if (!session) {
    return <Login />;
  }

  return <AuthenticatedApp session={session} />;
}

function getInviteTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("invite");
}

function clearInviteFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url.toString());
}

function AuthenticatedApp({ session }: { session: Session }) {
  const [inviteToken, setInviteToken] = useState<string | null>(getInviteTokenFromUrl);
  const club = useCurrentClub(session);
  const team = useCurrentTeam(session);
  // Roda em segundo plano assim que há sessão — independente de qual tela
  // está aberta, e sobrevive a trocar de tela/clube/equipa.
  const sync = useOutboxSync();

  function dismissInvite() {
    clearInviteFromUrl();
    setInviteToken(null);
  }

  // O convite é resolvido antes de qualquer outra tela — quem aceita um
  // convite pode não ter clube nenhum (um Lançador de dados só pertence à
  // equipa, nunca precisa criar/administrar um clube).
  if (inviteToken) {
    return (
      <AcceptInvite
        session={session}
        token={inviteToken}
        onAccepted={() => {
          dismissInvite();
          team.refresh();
          club.refresh();
        }}
        onDismiss={dismissInvite}
      />
    );
  }

  if (club.status === "loading" || team.status === "loading") {
    return <p className="empty">A carregar...</p>;
  }
  if (team.status === "error") {
    return <p className="banner error">Erro: {team.errorMessage}</p>;
  }

  if (team.status === "has-team") {
    return <TeamApp session={session} team={team.team!} club={club} sync={sync} />;
  }

  // Sem equipa ainda — onboarding normal: clube primeiro, depois equipa.
  if (club.status === "error") {
    return <p className="banner error">Erro: {club.errorMessage}</p>;
  }
  if (club.status === "no-club") {
    return <CreateClub session={session} onCreated={club.refresh} />;
  }
  return <CreateTeam session={session} clubId={club.club!.clubId} clubName={club.club!.clubName} onCreated={team.refresh} />;
}

function TeamApp({
  session,
  team,
  club,
  sync,
}: {
  session: Session;
  team: CurrentTeam;
  club: ReturnType<typeof useCurrentClub>;
  sync: ReturnType<typeof useOutboxSync>;
}) {
  const [activeMatch, setActiveMatch] = useState<{ id: string; opponent: string | null; formatId: string | null } | null>(null);
  const canTrackLive = team.role === "team_admin" || team.role === "data_entry";

  return (
    <div className={activeMatch ? "page wide" : "page"}>
      {activeMatch ? (
        <MatchFlow
          teamId={team.teamId}
          matchId={activeMatch.id}
          opponent={activeMatch.opponent}
          formatId={activeMatch.formatId}
          onExit={() => setActiveMatch(null)}
          sync={sync}
        />
      ) : (
        <>
          <div className="topbar">
            <div className="brand" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, width: "100%" }}>
              <h1>⚽ {team.teamName}</h1>
              <button type="button" className="btn sm ghost" onClick={() => supabase.auth.signOut()}>
                Sair
              </button>
            </div>
            <span className="tag">
              {session.user.email} · {ROLE_LABELS[team.role] ?? team.role}
            </span>
          </div>

          {sync.pending > 0 && (
            <p className="hint">{sync.syncing ? "A sincronizar..." : `${sync.pending} evento(s) por sincronizar`}</p>
          )}
          {/* Configurações de clube só fazem sentido para quem administra o clube — um
              membro convidado só para esta equipa (ex.: Lançador de dados) nunca terá
              club.status === "has-club", já que não faz parte de club_members. */}
          {club.status === "has-club" && (
            <ClubSettings
              clubId={club.club!.clubId}
              clubName={club.club!.clubName}
              clubShortName={club.club!.clubShortName}
              onUpdated={club.refresh}
            />
          )}

          <Roster teamId={team.teamId} canManage={team.role === "team_admin"} />
          <MatchFormats teamId={team.teamId} canManage={team.role === "team_admin"} />
          <Calendar
            teamId={team.teamId}
            canManage={team.role === "team_admin"}
            canTrackLive={canTrackLive}
            onStartMatch={(id, opponent, formatId) => setActiveMatch({ id, opponent, formatId })}
          />
          {team.role === "team_admin" && <TeamMembers teamId={team.teamId} />}
        </>
      )}
    </div>
  );
}
