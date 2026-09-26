import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

interface Props {
  clubId: string;
  clubName: string;
  clubShortName: string | null;
  onUpdated: () => void;
}

/** Cadastro do clube — nome e sigla (usada no jogo ao vivo em vez de "Nós", ver LiveMatch). */
export function ClubSettings({ clubId, clubName, clubShortName, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(clubName);
  const [shortName, setShortName] = useState(clubShortName ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSave(e: Event) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage("");
    const { error } = await supabase.from("clubs").update({ name, short_name: shortName || null }).eq("id", clubId);
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
        Clube: {clubName}
        {clubShortName ? ` (${clubShortName})` : ""}{" "}
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            setName(clubName);
            setShortName(clubShortName ?? "");
            setEditing(true);
          }}
        >
          Editar
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={handleSave} className="inline-fields" style={{ marginBottom: 8 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Nome do clube</label>
        <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} required style={{ width: 220 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Sigla (jogo ao vivo)</label>
        <input
          value={shortName}
          onInput={(e) => setShortName((e.target as HTMLInputElement).value)}
          placeholder="Ex.: AAL"
          style={{ width: 100 }}
        />
      </div>
      <button type="submit" className="btn sm primary" disabled={status === "saving"}>Salvar</button>
      <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancelar</button>
      {status === "error" && <span className="hint" style={{ color: "var(--red)" }}>{errorMessage}</span>}
    </form>
  );
}
