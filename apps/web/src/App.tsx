import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "preact/hooks";
import { Login } from "./auth/Login";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { MatchFlow } from "./match/MatchFlow";
import { Calendar } from "./team/Calendar";
import { CreateClub } from "./team/CreateClub";
import { CreateTeam } from "./team/CreateTeam";
import { MatchFormats } from "./team/MatchFormats";
import { Roster } from "./team/Roster";
import { useCurrentClub } from "./team/useCurrentClub";
import { useCurrentTeam } from "./team/useCurrentTeam";
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
      <div style={{ maxWidth: 480, margin: "64px auto", fontFamily: "system-ui, sans-serif" }}>
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
    return <p style={{ textAlign: "center", marginTop: 64 }}>A carregar...</p>;
  }

  if (!session) {
    return <Login />;
  }

  return <AuthenticatedApp session={session} />;
}

function AuthenticatedApp({ session }: { session: Session }) {
  const club = useCurrentClub(session);
  // Roda em segundo plano assim que há sessão — independente de qual tela
  // está aberta, e sobrevive a trocar de tela/clube/equipa.
  const sync = useOutboxSync();

  if (club.status === "loading") {
    return <p style={{ textAlign: "center", marginTop: 64 }}>A carregar clube...</p>;
  }
  if (club.status === "error") {
    return <p style={{ textAlign: "center", marginTop: 64, color: "crimson" }}>Erro: {club.errorMessage}</p>;
  }
  if (club.status === "no-club") {
    return <CreateClub session={session} onCreated={club.refresh} />;
  }

  // club.status === "has-club" a partir daqui — club.club nunca é null.
  return <ClubApp session={session} clubId={club.club!.clubId} clubName={club.club!.clubName} sync={sync} />;
}

function ClubApp({
  session,
  clubId,
  clubName,
  sync,
}: {
  session: Session;
  clubId: string;
  clubName: string;
  sync: ReturnType<typeof useOutboxSync>;
}) {
  const { status, team, errorMessage, refresh } = useCurrentTeam(session);
  const [activeMatch, setActiveMatch] = useState<{ id: string; opponent: string | null } | null>(null);

  if (status === "loading") {
    return <p style={{ textAlign: "center", marginTop: 64 }}>A carregar equipa...</p>;
  }
  if (status === "error") {
    return <p style={{ textAlign: "center", marginTop: 64, color: "crimson" }}>Erro: {errorMessage}</p>;
  }
  if (status === "no-team") {
    return <CreateTeam session={session} clubId={clubId} clubName={clubName} onCreated={refresh} />;
  }

  const canTrackLive = team?.role === "team_admin" || team?.role === "data_entry";

  return (
    <div style={{ maxWidth: activeMatch ? 720 : 480, margin: "64px auto", fontFamily: "system-ui, sans-serif" }}>
      {activeMatch && team ? (
        <MatchFlow
          teamId={team.teamId}
          matchId={activeMatch.id}
          opponent={activeMatch.opponent}
          onExit={() => setActiveMatch(null)}
          sync={sync}
        />
      ) : (
        <>
          <p>
            Sessão iniciada como <strong>{session.user.email}</strong>.{" "}
            <button type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
          </p>
          {sync.pending > 0 && (
            <p style={{ fontSize: 12, color: "#a60" }}>
              {sync.syncing ? "A sincronizar..." : `${sync.pending} evento(s) por sincronizar`}
            </p>
          )}
          <p style={{ color: "#666" }}>Clube: {clubName}</p>
          <h1 style={{ fontSize: 20 }}>{team?.teamName}</h1>
          <p style={{ color: "#666" }}>Papel: {team ? ROLE_LABELS[team.role] ?? team.role : ""}</p>

          {team && (
            <>
              <Roster teamId={team.teamId} canManage={team.role === "team_admin"} />
              <MatchFormats teamId={team.teamId} canManage={team.role === "team_admin"} />
              <Calendar
                teamId={team.teamId}
                canManage={team.role === "team_admin"}
                canTrackLive={canTrackLive}
                onStartMatch={(id, opponent) => setActiveMatch({ id, opponent })}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
