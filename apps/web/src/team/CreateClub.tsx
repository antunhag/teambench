import type { Session } from "@supabase/supabase-js";
import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { slugify } from "./slug";

interface Props {
  session: Session;
  onCreated: () => void;
}

/** Passo 1 do onboarding: criar o clube. O passo 2 (criar a primeira equipa) é uma tela separada. */
export function CreateClub({ session, onCreated }: Props) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage("");

    // Id gerado no navegador — mesmo motivo do CreateTeam: no instante do
    // insert o usuário ainda não é membro do clube, então um `.select()` de
    // volta seria barrado pela política de leitura.
    const clubId = crypto.randomUUID();
    const { error: clubError } = await supabase.from("clubs").insert({ id: clubId, name, slug: slugify(name) });
    if (clubError) {
      setStatus("error");
      setErrorMessage(clubError.message);
      return;
    }

    const { error: memberError } = await supabase
      .from("club_members")
      .insert({ club_id: clubId, user_id: session.user.id });
    if (memberError) {
      setStatus("error");
      setErrorMessage(memberError.message);
      return;
    }

    onCreated();
  }

  return (
    <div className="page" style={{ maxWidth: 400 }}>
      <h1 style={{ fontSize: 20 }}>Criar o seu clube</h1>
      <p className="hint" style={{ marginBottom: 16 }}>
        Você vai ser o administrador do clube — depois disto, cria-se a primeira equipa dentro dele.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Nome do clube</label>
          <input
            required
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Ex.: Associação Académica de Leça"
          />
        </div>
        <button type="submit" className="btn primary block" disabled={status === "saving"}>
          {status === "saving" ? "A criar..." : "Criar clube"}
        </button>
        {status === "error" && <p className="banner error" style={{ marginTop: 8 }}>{errorMessage}</p>}
      </form>
    </div>
  );
}
