import { useState } from "preact/hooks";
import { inviteLink, useTeamMembers, type TeamRole } from "./useTeamMembers";

interface Props {
  teamId: string;
}

const ROLE_LABELS: Record<TeamRole, string> = {
  team_admin: "Admin da Equipa",
  data_entry: "Lançador de dados",
  viewer: "Visualizador",
};

/** Só visível para quem já é Admin da Equipa — gere quem tem acesso e convida gente nova. */
export function TeamMembers({ teamId }: Props) {
  const { members, invites, status, errorMessage, createInvite, revokeInvite, removeMember } = useTeamMembers(teamId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("data_entry");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");

  async function handleInvite(e: Event) {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveError("");
    try {
      const token = await createInvite(email, role);
      setLastLink({ email, url: inviteLink(token) });
      setEmail("");
      setSaveStatus("idle");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("Link copiado!");
    } catch {
      setCopyFeedback(url);
    }
    setTimeout(() => setCopyFeedback(""), 3000);
  }

  if (status === "loading") return <p className="empty">A carregar membros da equipa...</p>;
  if (status === "error") return <p className="banner error">Erro: {errorMessage}</p>;

  return (
    <div className="card">
      <h2 className="section-title">Acesso à equipa</h2>

      <div>
        {members.map((m) => (
          <div key={m.id} className="list-row">
            <span className="lname" style={{ fontWeight: 400 }}>
              {m.email} <span className="lsub">— {ROLE_LABELS[m.role]}</span>
            </span>
            {members.length > 1 && (
              <button type="button" className="btn sm danger" onClick={() => confirm(`Remover ${m.email} da equipa?`) && removeMember(m.id)}>
                Remover
              </button>
            )}
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 12, marginBottom: 4 }}>Convites pendentes</h3>
          <div>
            {invites.map((i) => (
              <div key={i.id} className="list-row">
                <span className="lname" style={{ fontWeight: 400 }}>
                  {i.email} <span className="lsub">— {ROLE_LABELS[i.role]}</span>
                </span>
                <span>
                  <button type="button" className="btn sm ghost" onClick={() => copyLink(inviteLink(i.token))}>Copiar link</button>{" "}
                  <button type="button" className="btn sm danger" onClick={() => revokeInvite(i.id)}>Revogar</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <form onSubmit={handleInvite} className="inline-fields" style={{ marginTop: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Email a convidar</label>
          <input
            type="email"
            required
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            style={{ width: 220 }}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Papel</label>
          <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as TeamRole)}>
            <option value="data_entry">Lançador de dados</option>
            <option value="team_admin">Admin da Equipa</option>
            <option value="viewer">Visualizador</option>
          </select>
        </div>
        <button type="submit" className="btn primary" disabled={saveStatus === "saving"}>
          Gerar convite
        </button>
      </form>
      {saveStatus === "error" && <p className="banner error" style={{ marginTop: 8 }}>{saveError}</p>}

      {lastLink && (
        <div className="card" style={{ marginTop: 8, boxShadow: "none" }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            Convite criado para <strong>{lastLink.email}</strong>. Envie este link a essa pessoa (WhatsApp, email...):
          </p>
          <p style={{ margin: "6px 0", wordBreak: "break-all", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>{lastLink.url}</p>
          <button type="button" className="btn sm ghost" onClick={() => copyLink(lastLink.url)}>Copiar link</button>
          {copyFeedback && <span className="hint" style={{ marginLeft: 8, color: "var(--court)" }}>{copyFeedback}</span>}
        </div>
      )}
    </div>
  );
}
