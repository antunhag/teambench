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

  if (status === "loading") return <p>A carregar membros da equipa...</p>;
  if (status === "error") return <p style={{ color: "crimson" }}>Erro: {errorMessage}</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>Acesso à equipa</h2>

      <ul style={{ paddingLeft: 0, listStyle: "none" }}>
        {members.map((m) => (
          <li key={m.id} style={{ borderTop: "1px solid #eee", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              {m.email} <span style={{ color: "#666", fontSize: 12 }}>— {ROLE_LABELS[m.role]}</span>
            </span>
            {members.length > 1 && (
              <button type="button" onClick={() => confirm(`Remover ${m.email} da equipa?`) && removeMember(m.id)}>
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, color: "#666", marginTop: 12 }}>Convites pendentes</h3>
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {invites.map((i) => (
              <li key={i.id} style={{ borderTop: "1px solid #eee", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  {i.email} <span style={{ color: "#666", fontSize: 12 }}>— {ROLE_LABELS[i.role]}</span>
                </span>
                <span>
                  <button type="button" onClick={() => copyLink(inviteLink(i.token))}>Copiar link</button>{" "}
                  <button type="button" onClick={() => revokeInvite(i.id)}>Revogar</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <form onSubmit={handleInvite} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>
          Email a convidar
          <input
            type="email"
            required
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            style={{ display: "block", width: 220 }}
          />
        </label>
        <label>
          Papel
          <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as TeamRole)} style={{ display: "block" }}>
            <option value="data_entry">Lançador de dados</option>
            <option value="team_admin">Admin da Equipa</option>
            <option value="viewer">Visualizador</option>
          </select>
        </label>
        <button type="submit" disabled={saveStatus === "saving"}>
          Gerar convite
        </button>
      </form>
      {saveStatus === "error" && <p style={{ color: "crimson" }}>{saveError}</p>}

      {lastLink && (
        <div style={{ marginTop: 8, border: "1px solid #ddd", borderRadius: 8, padding: 10, fontSize: 13 }}>
          <p style={{ margin: 0 }}>
            Convite criado para <strong>{lastLink.email}</strong>. Envie este link a essa pessoa (WhatsApp, email...):
          </p>
          <p style={{ margin: "6px 0", wordBreak: "break-all", fontFamily: "monospace", fontSize: 12 }}>{lastLink.url}</p>
          <button type="button" onClick={() => copyLink(lastLink.url)}>Copiar link</button>
          {copyFeedback && <span style={{ marginLeft: 8, color: "#2a7" }}>{copyFeedback}</span>}
        </div>
      )}
    </div>
  );
}
