import { useState } from "preact/hooks";
import { useMatchFormats } from "./useMatchFormats";

interface Props {
  teamId: string;
  canManage: boolean;
}

/** Duração de jogo configurável — cada equipa/competição pode ter a sua (ver plano: match_formats). */
export function MatchFormats({ teamId, canManage }: Props) {
  const { formats, status, errorMessage, addFormat, setDefault } = useMatchFormats(teamId);

  const [name, setName] = useState("");
  const [periodCount, setPeriodCount] = useState(2);
  const [periodMinutes, setPeriodMinutes] = useState(25);
  const [overtimePeriodCount, setOvertimePeriodCount] = useState(0);
  const [overtimeMinutes, setOvertimeMinutes] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  async function handleAdd(e: Event) {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveError("");
    try {
      await addFormat(
        { name, periodCount, periodMinutes, overtimePeriodCount, overtimeMinutes },
        formats.length === 0 // o primeiro formato criado já vira o padrão automaticamente
      );
      setName("");
      setSaveStatus("idle");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === "loading") return <p>A carregar formatos de jogo...</p>;
  if (status === "error") return <p style={{ color: "crimson" }}>Erro: {errorMessage}</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>Formato de jogo</h2>
      {formats.length === 0 ? (
        <p style={{ color: "#666" }}>Ainda sem formato definido — os jogos vão precisar de um.</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {formats.map((f) => (
            <li key={f.id} style={{ borderTop: "1px solid #eee", padding: "8px 0" }}>
              <strong>{f.name}</strong>
              {f.isDefault && <span style={{ marginLeft: 6, fontSize: 11, color: "#666" }}>(padrão)</span>}
              <div style={{ fontSize: 13, color: "#666" }}>
                {f.periodCount}×{f.periodMinutes} min
                {f.overtimePeriodCount > 0 ? ` + ${f.overtimePeriodCount}×${f.overtimeMinutes} min prolongamento` : ""}
              </div>
              {canManage && !f.isDefault && (
                <button type="button" onClick={() => setDefault(f.id)} style={{ marginTop: 4 }}>
                  Tornar padrão
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={handleAdd} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>
            Nome
            <input required value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Ex.: Campeonato Distrital Sub-15" style={{ display: "block", width: 220 }} />
          </label>
          <label>
            Partes
            <input type="number" min={1} value={periodCount} onInput={(e) => setPeriodCount(Number((e.target as HTMLInputElement).value))} style={{ display: "block", width: 60 }} />
          </label>
          <label>
            Min/parte
            <input type="number" min={1} value={periodMinutes} onInput={(e) => setPeriodMinutes(Number((e.target as HTMLInputElement).value))} style={{ display: "block", width: 70 }} />
          </label>
          <label>
            Prolongamentos
            <input type="number" min={0} value={overtimePeriodCount} onInput={(e) => setOvertimePeriodCount(Number((e.target as HTMLInputElement).value))} style={{ display: "block", width: 60 }} />
          </label>
          <label>
            Min/prolong.
            <input type="number" min={0} value={overtimeMinutes} onInput={(e) => setOvertimeMinutes(Number((e.target as HTMLInputElement).value))} style={{ display: "block", width: 70 }} />
          </label>
          <button type="submit" disabled={saveStatus === "saving"}>
            Adicionar formato
          </button>
        </form>
      )}
      {saveStatus === "error" && <p style={{ color: "crimson" }}>{saveError}</p>}
    </div>
  );
}
