import { useState } from "preact/hooks";
import { useMatchFormats } from "./useMatchFormats";
import { useMatches, type MatchFields, type MatchRow } from "./useMatches";

interface Props {
  teamId: string;
  canManage: boolean;
  canTrackLive: boolean;
  onStartMatch: (matchId: string, opponent: string | null) => void;
}

const emptyForm: MatchFields = { matchDate: "", opponent: "", competition: null, location: null, kickoffTime: null, formatId: null };

function MatchForm({
  initial,
  formats,
  onSave,
  onCancel,
}: {
  initial: MatchFields;
  formats: { id: string; name: string; isDefault: boolean }[];
  onSave: (fields: MatchFields) => Promise<void>;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<MatchFields>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setStatus("saving");
    try {
      await onSave(fields);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", border: "1px solid #ddd", borderRadius: 8, padding: 10, marginTop: 8 }}>
      <label>
        Data
        <input type="date" required value={fields.matchDate} onInput={(e) => setFields({ ...fields, matchDate: (e.target as HTMLInputElement).value })} style={{ display: "block" }} />
      </label>
      <label>
        Adversário
        <input required value={fields.opponent} onInput={(e) => setFields({ ...fields, opponent: (e.target as HTMLInputElement).value })} style={{ display: "block", width: 160 }} />
      </label>
      <label>
        Competição
        <input value={fields.competition ?? ""} onInput={(e) => setFields({ ...fields, competition: (e.target as HTMLInputElement).value || null })} style={{ display: "block", width: 140 }} />
      </label>
      <label>
        Local
        <input value={fields.location ?? ""} onInput={(e) => setFields({ ...fields, location: (e.target as HTMLInputElement).value || null })} style={{ display: "block", width: 140 }} />
      </label>
      <label>
        Hora
        <input type="time" value={fields.kickoffTime ?? ""} onInput={(e) => setFields({ ...fields, kickoffTime: (e.target as HTMLInputElement).value || null })} style={{ display: "block" }} />
      </label>
      <label>
        Formato
        <select value={fields.formatId ?? ""} onChange={(e) => setFields({ ...fields, formatId: (e.target as HTMLSelectElement).value || null })} style={{ display: "block" }}>
          <option value="">(padrão da equipa)</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={status === "saving"}>Salvar</button>
      <button type="button" onClick={onCancel}>Cancelar</button>
      {status === "error" && <span style={{ color: "crimson", fontSize: 12 }}>{error}</span>}
    </form>
  );
}

export function Calendar({ teamId, canManage, canTrackLive, onStartMatch }: Props) {
  const { matches, status, errorMessage, createMatch, updateMatch, deleteMatch, bulkImport } = useMatches(teamId);
  const { formats } = useMatchFormats(teamId);
  const defaultFormat = formats.find((f) => f.isDefault) ?? null;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchRow | null>(null);

  const [importText, setImportText] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "saving" | "error">("idle");

  async function handleImport() {
    if (!importText.trim()) return;
    setImportStatus("saving");
    try {
      const result = await bulkImport(importText, defaultFormat?.id ?? null);
      setImportSummary(`${result.added} novo(s), ${result.updated} atualizado(s)` + (result.skipped ? `, ${result.skipped} ignorada(s)` : ""));
      setImportText("");
      setImportStatus("idle");
    } catch (err) {
      setImportSummary(`Erro: ${err instanceof Error ? err.message : String(err)}`);
      setImportStatus("error");
    }
  }

  if (status === "loading") return <p>A carregar calendário...</p>;
  if (status === "error") return <p style={{ color: "crimson" }}>Erro: {errorMessage}</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>Calendário de jogos ({matches.length})</h2>
      {matches.length === 0 ? (
        <p style={{ color: "#666" }}>Ainda sem jogos.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666", fontSize: 12 }}>
              <th>Data</th>
              <th>Adversário</th>
              <th>Competição</th>
              <th>Local</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {matches.map((m) =>
              editingMatch?.id === m.id ? (
                <tr key={m.id}>
                  <td colSpan={5}>
                    <MatchForm
                      initial={{
                        matchDate: m.matchDate,
                        opponent: m.opponent ?? "",
                        competition: m.competition,
                        location: m.location,
                        kickoffTime: m.kickoffTime,
                        formatId: m.formatId,
                      }}
                      formats={formats}
                      onCancel={() => setEditingMatch(null)}
                      onSave={async (fields) => {
                        await updateMatch(m.id, fields);
                        setEditingMatch(null);
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={m.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "6px 0" }}>{m.matchDate.split("-").reverse().join("/")}</td>
                  <td>{m.opponent}</td>
                  <td>{m.competition}</td>
                  <td>{m.location}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {canTrackLive && (
                      <button type="button" onClick={() => onStartMatch(m.id, m.opponent)}>
                        Iniciar jogo
                      </button>
                    )}{" "}
                    {canManage && (
                      <>
                        <button type="button" onClick={() => setEditingMatch(m)}>Editar</button>{" "}
                        <button type="button" onClick={() => confirm(`Apagar o jogo vs ${m.opponent}?`) && deleteMatch(m.id)}>
                          Apagar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      {canManage && (
        <div style={{ marginTop: 12 }}>
          {!showAddForm ? (
            <button type="button" onClick={() => setShowAddForm(true)}>+ Adicionar jogo</button>
          ) : (
            <MatchForm
              initial={{ ...emptyForm, formatId: defaultFormat?.id ?? null }}
              formats={formats}
              onCancel={() => setShowAddForm(false)}
              onSave={async (fields) => {
                await createMatch(fields);
                setShowAddForm(false);
              }}
            />
          )}

          <div style={{ marginTop: 16 }}>
            {!defaultFormat && (
              <p style={{ color: "#a60", fontSize: 13 }}>
                ⚠️ Defina um formato de jogo padrão acima antes de importar — os jogos novos vão usá-lo automaticamente.
              </p>
            )}
            <p style={{ color: "#666", fontSize: 12 }}>
              Ou cola várias linhas de uma vez (Data, Adversário, Competição, Local, Hora). Data em dd/mm/aaaa. Casa jogos já
              existentes por data+adversário — não duplica ao colar de novo.
            </p>
            <textarea
              value={importText}
              onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
              style={{ width: "100%", minHeight: 80, fontFamily: "monospace" }}
            />
            <button type="button" onClick={handleImport} disabled={importStatus === "saving"} style={{ marginTop: 8 }}>
              {importStatus === "saving" ? "A importar..." : "Importar calendário"}
            </button>
            {importSummary && <p style={{ marginTop: 8 }}>{importSummary}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
