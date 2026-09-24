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
    <div className="page" style={{ maxWidth: 400 }}>
      <h1 style={{ fontSize: 20 }}>Criar a primeira equipa</h1>
      <p className="hint" style={{ marginBottom: 16 }}>
        Clube: <strong>{clubName}</strong>. Você vai ser o administrador desta equipa.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Nome da equipa</label>
          <input
            required
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Ex.: Sub-15"
          />
        </div>
        <button type="submit" className="btn primary block" disabled={status === "saving"}>
          {status === "saving" ? "A criar..." : "Criar equipa"}
        </button>
        {status === "error" && <p className="banner error" style={{ marginTop: 8 }}>{errorMessage}</p>}
      </form>
    </div>
  );
}
