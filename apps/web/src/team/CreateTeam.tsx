import type { Session } from "@supabase/supabase-js";
import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { slugify } from "./slug";

interface Props {
  session: Session;
  clubId: string;
  clubName: string;
  onCreated: () => void;
}

/** Passo 2 do onboarding: criar a primeira equipa dentro do clube já criado. */
export function CreateTeam({ session, clubId, clubName, onCreated }: Props) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage("");

    // Id gerado no navegador — mesmo motivo do CreateClub: evita depender de
    // reler a linha antes do usuário virar membro da equipa.
    const teamId = crypto.randomUUID();
    const { error: teamError } = await supabase
      .from("teams")
      .insert({ id: teamId, club_id: clubId, name, slug: slugify(name) });

    if (teamError) {
      setStatus("error");
      setErrorMessage(teamError.message);
      return;
    }

    const { error: memberError } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, user_id: session.user.id, role: "team_admin" });

    if (memberError) {
      setStatus("error");
      setErrorMessage(memberError.message);
      return;
    }

    onCreated();
  }

  return (
    <div style={{ maxWidth: 400, margin: "64px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>Criar a primeira equipa</h1>
      <p style={{ color: "#666" }}>
        Clube: <strong>{clubName}</strong>. Você vai ser o administrador desta equipa.
      </p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Nome da equipa
          <input
            required
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Ex.: Sub-15"
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <button type="submit" disabled={status === "saving"} style={{ width: "100%", padding: 10, marginTop: 8 }}>
          {status === "saving" ? "A criar..." : "Criar equipa"}
        </button>
        {status === "error" && <p style={{ color: "crimson", marginTop: 8 }}>{errorMessage}</p>}
      </form>
    </div>
  );
}
