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

  if (status === "loading") return <p className="empty">A carregar formatos de jogo...</p>;
  if (status === "error") return <p className="banner error">Erro: {errorMessage}</p>;

  return (
    <div className="card">
      <h2 className="section-title">Formato de jogo</h2>
      {formats.length === 0 ? (
        <p className="empty">Ainda sem formato definido — os jogos vão precisar de um.</p>
      ) : (
        <div>
          {formats.map((f) => (
            <div key={f.id} className="list-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <div>
                <span className="lname">{f.name}</span>
                {f.isDefault && <span className="pill" style={{ marginLeft: 6 }}>padrão</span>}
                <div className="lsub">
                  {f.periodCount}×{f.periodMinutes} min
                  {f.overtimePeriodCount > 0 ? ` + ${f.overtimePeriodCount}×${f.overtimeMinutes} min prolongamento` : ""}
                </div>
              </div>
              {canManage && !f.isDefault && (
                <button type="button" className="btn sm ghost" onClick={() => setDefault(f.id)} style={{ marginTop: 4 }}>
                  Tornar padrão
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Nome</label>
            <input required value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Ex.: Campeonato Distrital Sub-15" style={{ width: 220 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Partes</label>
            <input type="number" min={1} value={periodCount} onInput={(e) => setPeriodCount(Number((e.target as HTMLInputElement).value))} style={{ width: 60 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Min/parte</label>
            <input type="number" min={1} value={periodMinutes} onInput={(e) => setPeriodMinutes(Number((e.target as HTMLInputElement).value))} style={{ width: 70 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Prolongamentos</label>
            <input type="number" min={0} value={overtimePeriodCount} onInput={(e) => setOvertimePeriodCount(Number((e.target as HTMLInputElement).value))} style={{ width: 60 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Min/prolong.</label>
            <input type="number" min={0} value={overtimeMinutes} onInput={(e) => setOvertimeMinutes(Number((e.target as HTMLInputElement).value))} style={{ width: 70 }} />
          </div>
          <button type="submit" className="btn primary" disabled={saveStatus === "saving"}>
            Adicionar formato
          </button>
        </form>
      )}
      {saveStatus === "error" && <p className="banner error" style={{ marginTop: 8 }}>{saveError}</p>}
    </div>
  );
}
