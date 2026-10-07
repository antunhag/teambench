import { useState } from "preact/hooks";
import { toErrorMessage } from "../errorMessage";
import { inviteLink, useTeamMembers, type TeamRole } from "./useTeamMembers";
import { useResourceLock } from "./useResourceLock";

interface Props {
  teamId: string;
}

const ROLE_LABELS: Record<TeamRole, string> = {
  team_admin: "Admin da Equipa",
  data_entry: "Lançador de dados",
  viewer: "Visualizador",
};

const EVENT_LABELS: Record<"granted" | "revoked", string> = {
  granted: "entrou",
  revoked: "saiu",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Só visível para quem já é Admin da Equipa — gere quem tem acesso e convida gente nova. */
export function TeamMembers({ teamId }: Props) {
  const { members, invites, accessLog, status, errorMessage, createInvite, revokeInvite, removeMember, changeRole } = useTeamMembers(teamId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("data_entry");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [memberError, setMemberError] = useState("");
  const [showAccessLog, setShowAccessLog] = useState(false);

  // Só o formulário de gerar convite (composição multi-campo) entra em
  // disputa pela trava — remover membro/revogar convite são ações de um
  // clique só, sem estado em progresso pra perder, mesma lógica aplicada em
  // Roster.tsx/MatchFormats.tsx (nunca trava só por ver a lista, FR-006).
  const lock = useResourceLock(teamId, "invites", email !== "");

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
      setSaveError(toErrorMessage(err));
    }
  }

  async function handleRemoveMember(id: string, memberEmail: string) {
    setMemberError("");
    try {
      await removeMember(id);
    } catch (err) {
      const message = toErrorMessage(err);
      setMemberError(
        message.includes("last_admin")
          ? `Não é possível remover ${memberEmail} — é o único Admin da Equipa. Promove outra pessoa a Admin primeiro.`
          : message
      );
    }
  }

  async function handleChangeRole(id: string, newRole: TeamRole, memberEmail: string) {
    setMemberError("");
    try {
      await changeRole(id, newRole);
    } catch (err) {
      const message = toErrorMessage(err);
      setMemberError(
        message.includes("last_admin")
          ? `Não é possível mudar o papel de ${memberEmail} — é o único Admin da Equipa. Promove outra pessoa a Admin primeiro.`
          : message
      );
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
            <span className="lname" style={{ fontWeight: 400 }}>{m.email}</span>
            <span>
              <select
                value={m.role}
                onChange={(e) => handleChangeRole(m.id, (e.target as HTMLSelectElement).value as TeamRole, m.email)}
                style={{ marginRight: 8 }}
              >
                <option value="team_admin">Admin da Equipa</option>
                <option value="data_entry">Lançador de dados</option>
                <option value="viewer">Visualizador</option>
              </select>
              {members.length > 1 && (
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={() => confirm(`Remover ${m.email} da equipa?`) && handleRemoveMember(m.id, m.email)}
                >
                  Remover
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {memberError && <p className="banner error" style={{ marginTop: 8 }}>{memberError}</p>}

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

      {lock.status === "readonly" && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          Os Convites estão a ser editados por outra pessoa agora.{" "}
          <button type="button" className="btn sm ghost" onClick={() => setEmail("")}>Fechar</button>
        </div>
      )}
      {lock.status !== "readonly" && (
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
          <button type="submit" className="btn primary" disabled={saveStatus === "saving" || lock.status === "checking"}>
            Gerar convite
          </button>
        </form>
      )}
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

      {accessLog.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button type="button" className="btn sm ghost" onClick={() => setShowAccessLog((v) => !v)}>
            {showAccessLog ? "Ocultar" : "Ver"} histórico de acesso ({accessLog.length})
          </button>
          {showAccessLog && (
            <div style={{ marginTop: 8 }}>
              {accessLog.map((l) => (
                <div key={l.id} className="list-row" style={{ fontSize: 12.5 }}>
                  <span className="lsub">
                    {fmtDate(l.createdAt)} — <strong>{l.targetEmail}</strong> {EVENT_LABELS[l.eventType]} ({ROLE_LABELS[l.role]})
                    {l.eventType === "revoked" && l.actorEmail ? ` — removido por ${l.actorEmail}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
