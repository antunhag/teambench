import { useState } from "preact/hooks";
import { toErrorMessage } from "../errorMessage";
import { useMatchFormats } from "./useMatchFormats";
import { useMatches, type MatchFields, type MatchRow } from "./useMatches";

interface Props {
  teamId: string;
  canManage: boolean;
  canTrackLive: boolean;
  onStartMatch: (matchId: string, opponent: string | null, formatId: string | null) => void;
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
      setError(toErrorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-fields" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, marginTop: 8 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Data</label>
        <input type="date" required value={fields.matchDate} onInput={(e) => setFields({ ...fields, matchDate: (e.target as HTMLInputElement).value })} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Adversário</label>
        <input required value={fields.opponent} onInput={(e) => setFields({ ...fields, opponent: (e.target as HTMLInputElement).value })} style={{ width: 160 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Competição</label>
        <input value={fields.competition ?? ""} onInput={(e) => setFields({ ...fields, competition: (e.target as HTMLInputElement).value || null })} style={{ width: 140 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Local</label>
        <input value={fields.location ?? ""} onInput={(e) => setFields({ ...fields, location: (e.target as HTMLInputElement).value || null })} style={{ width: 140 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Hora</label>
        <input type="time" value={fields.kickoffTime ?? ""} onInput={(e) => setFields({ ...fields, kickoffTime: (e.target as HTMLInputElement).value || null })} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Formato</label>
        <select value={fields.formatId ?? ""} onChange={(e) => setFields({ ...fields, formatId: (e.target as HTMLSelectElement).value || null })}>
          <option value="">(padrão da equipa)</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn sm primary" disabled={status === "saving"}>Salvar</button>
      <button type="button" className="btn sm ghost" onClick={onCancel}>Cancelar</button>
      {status === "error" && <span className="hint" style={{ color: "var(--red)" }}>{error}</span>}
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
      setImportSummary(`Erro: ${toErrorMessage(err)}`);
      setImportStatus("error");
    }
  }

  if (status === "loading") return <p className="empty">A carregar calendário...</p>;
  if (status === "error") return <p className="banner error">Erro: {errorMessage}</p>;

  return (
    <div className="card">
      <h2 className="section-title">Calendário de jogos ({matches.length})</h2>
      {matches.length === 0 ? (
        <p className="empty">Ainda sem jogos.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
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
                  <tr key={m.id}>
                    <td>{m.matchDate.split("-").reverse().join("/")}</td>
                    <td>{m.opponent}</td>
                    <td>{m.competition}</td>
                    <td>{m.location}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canTrackLive && (
                        <button type="button" className="btn sm primary" onClick={() => onStartMatch(m.id, m.opponent, m.formatId)}>
                          Iniciar jogo
                        </button>
                      )}{" "}
                      {canManage && (
                        <>
                          <button type="button" className="btn sm ghost" onClick={() => setEditingMatch(m)}>Editar</button>{" "}
                          <button type="button" className="btn sm danger" onClick={() => confirm(`Apagar o jogo vs ${m.opponent}?`) && deleteMatch(m.id)}>
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
        </div>
      )}

      {canManage && (
        <div style={{ marginTop: 12 }}>
          {!showAddForm ? (
            <button type="button" className="btn primary" onClick={() => setShowAddForm(true)}>+ Adicionar jogo</button>
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
              <p className="banner warn">
                ⚠️ Defina um formato de jogo padrão acima antes de importar — os jogos novos vão usá-lo automaticamente.
              </p>
            )}
            <p className="hint">
              Ou cola várias linhas de uma vez (Data, Adversário, Competição, Local, Hora). Data em dd/mm/aaaa. Casa jogos já
              existentes por data+adversário — não duplica ao colar de novo.
            </p>
            <textarea
              className="exportbox"
              value={importText}
              onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
            />
            <button type="button" className="btn primary" onClick={handleImport} disabled={importStatus === "saving"} style={{ marginTop: 8 }}>
              {importStatus === "saving" ? "A importar..." : "Importar calendário"}
            </button>
            {importSummary && <p className="hint" style={{ marginTop: 8 }}>{importSummary}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
