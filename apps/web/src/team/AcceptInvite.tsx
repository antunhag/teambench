import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

interface Props {
  session: Session;
  token: string;
  onAccepted: () => void;
  onDismiss: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  team_admin: "Admin da Equipa",
  data_entry: "Lançador de dados",
  viewer: "Visualizador",
};

type InvitePreview = { email: string; role: string; teamName: string } | null;

/** Ecrã mostrado quando o URL traz ?invite=<token> — antes de qualquer outra tela do app. */
export function AcceptInvite({ session, token, onAccepted, onDismiss }: Props) {
  const [preview, setPreview] = useState<InvitePreview>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "error" | "not-found">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .rpc("preview_invite", { p_token: token })
        .maybeSingle<{ email: string; role: string; team_name: string }>();
      if (cancelled) return;
      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }
      if (!data) {
        setStatus("not-found");
        return;
      }
      setPreview({ email: data.email, role: data.role, teamName: data.team_name ?? "" });
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setStatus("accepting");
    setErrorMessage("");
    const { error } = await supabase.rpc("accept_invite", { p_token: token });
    if (error) {
      setStatus("error");
      setErrorMessage(
        error.message.includes("invite_email_mismatch")
          ? `Este convite foi enviado para outro email. Você entrou como ${session.user.email}.`
          : error.message.includes("invite_expired")
            ? "Este convite expirou — peça um novo à sua equipa."
            : error.message.includes("invite_already_accepted")
              ? "Este convite já foi usado."
              : error.message
      );
      return;
    }
    onAccepted();
  }

  return (
    <div style={{ maxWidth: 400, margin: "64px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Convite para equipa</h1>

      {status === "loading" && <p>A verificar convite...</p>}
      {status === "not-found" && (
        <>
          <p style={{ color: "crimson" }}>
            Convite não encontrado para <strong>{session.user.email}</strong>. Confirme que entrou com o mesmo email
            que recebeu o convite.
          </p>
          <button type="button" onClick={onDismiss}>Continuar sem aceitar</button>
        </>
      )}
      {preview && (status === "ready" || status === "accepting" || status === "error") && (
        <>
          <p>
            Você foi convidado para a equipa <strong>{preview.teamName}</strong> como{" "}
            <strong>{ROLE_LABELS[preview.role] ?? preview.role}</strong>.
          </p>
          <p style={{ color: "#666", fontSize: 13 }}>Convite endereçado a {preview.email}.</p>
          <button type="button" onClick={handleAccept} disabled={status === "accepting"} style={{ width: "100%", padding: 10, marginTop: 8 }}>
            {status === "accepting" ? "A aceitar..." : "Aceitar convite"}
          </button>
          {status === "error" && <p style={{ color: "crimson", marginTop: 8 }}>{errorMessage}</p>}
          <button type="button" onClick={onDismiss} style={{ marginTop: 8 }}>Cancelar</button>
        </>
      )}
    </div>
  );
}
