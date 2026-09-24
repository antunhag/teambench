import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

interface Props {
  clubId: string;
  clubName: string;
  onUpdated: () => void;
}

/** Cadastro do clube — por agora só o nome; é a base para crescer (múltiplas equipas, convites de outro admin). */
export function ClubSettings({ clubId, clubName, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(clubName);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSave(e: Event) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage("");
    const { error } = await supabase.from("clubs").update({ name }).eq("id", clubId);
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("idle");
    setEditing(false);
    onUpdated();
  }

  if (!editing) {
    return (
      <p className="hint" style={{ marginBottom: 4 }}>
        Clube: {clubName}{" "}
        <button type="button" className="btn sm ghost" onClick={() => { setName(clubName); setEditing(true); }}>
          Editar
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={handleSave} className="inline-fields" style={{ marginBottom: 8 }}>
      <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required style={{ width: 220 }} />
      <button type="submit" className="btn sm primary" disabled={status === "saving"}>Salvar</button>
      <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancelar</button>
      {status === "error" && <span className="hint" style={{ color: "var(--red)" }}>{errorMessage}</span>}
    </form>
  );
}
