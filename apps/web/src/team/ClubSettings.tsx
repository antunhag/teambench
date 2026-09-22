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
      <p style={{ color: "#666" }}>
        Clube: {clubName}{" "}
        <button type="button" onClick={() => { setName(clubName); setEditing(true); }} style={{ fontSize: 11 }}>
          Editar
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
      <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required />
      <button type="submit" disabled={status === "saving"}>Salvar</button>
      <button type="button" onClick={() => setEditing(false)}>Cancelar</button>
      {status === "error" && <span style={{ color: "crimson", fontSize: 12 }}>{errorMessage}</span>}
    </form>
  );
}
