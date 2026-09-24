import { useState } from "preact/hooks";
import { POSITIONS, posAbbr, type Position } from "./positions";
import { usePlayers, type PlayerRow } from "./usePlayers";

interface Props {
  teamId: string;
  canManage: boolean; // só team_admin gerencia o plantel
}

function EditRow({ p, onSave, onCancel }: { p: PlayerRow; onSave: (fields: { num: string; name: string; position: Position }) => void; onCancel: () => void }) {
  const [num, setNum] = useState(p.num ?? "");
  const [name, setName] = useState(p.name);
  const [position, setPosition] = useState<Position>(p.position ?? "Universal");
  return (
    <tr>
      <td>
        <input value={num} onInput={(e) => setNum((e.target as HTMLInputElement).value)} style={{ width: 50 }} />
      </td>
      <td>
        <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ width: 160 }} />
      </td>
      <td>
        <select value={position} onChange={(e) => setPosition((e.target as HTMLSelectElement).value as Position)}>
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <button type="button" className="btn sm primary" onClick={() => onSave({ num, name, position })}>Salvar</button>{" "}
        <button type="button" className="btn sm ghost" onClick={onCancel}>Cancelar</button>
      </td>
    </tr>
  );
}

export function Roster({ teamId, canManage }: Props) {
  const { players, status, errorMessage, addPlayer, updatePlayer, deactivatePlayer, reactivatePlayer, bulkImport } = usePlayers(teamId);
  const active = players.filter((p) => p.active);
  const inactive = players.filter((p) => !p.active);

  const [num, setNum] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState<Position>("Universal");
  const [addStatus, setAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [addError, setAddError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [importText, setImportText] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "saving" | "error">("idle");

  async function handleAdd(e: Event) {
    e.preventDefault();
    setAddStatus("saving");
    setAddError("");
    try {
      await addPlayer(num, name, position);
      setNum("");
      setName("");
      setPosition("Universal");
      setAddStatus("idle");
    } catch (err) {
      setAddStatus("error");
      setAddError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImportStatus("saving");
    try {
      const result = await bulkImport(importText);
      setImportSummary(
        `${result.added} novo(s), ${result.updated} atualizado(s)` +
          (result.skipped ? `, ${result.skipped} ignorada(s)` : "") +
          (result.dupNums.length ? ` — ⚠️ nº repetido: ${result.dupNums.join(", ")}` : "")
      );
      setImportText("");
      setImportStatus("idle");
    } catch (err) {
      setImportSummary(`Erro: ${err instanceof Error ? err.message : String(err)}`);
      setImportStatus("error");
    }
  }

  if (status === "loading") return <p className="empty">A carregar plantel...</p>;
  if (status === "error") return <p className="banner error">Erro: {errorMessage}</p>;

  return (
    <div className="card">
      <h2 className="section-title">Plantel ({active.length})</h2>
      {active.length === 0 ? (
        <p className="empty">Ainda sem atletas.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="num">Nº</th>
                <th>Nome</th>
                <th>Posição</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {active.map((p) =>
                canManage && editingId === p.id ? (
                  <EditRow
                    key={p.id}
                    p={p}
                    onCancel={() => setEditingId(null)}
                    onSave={async (fields) => {
                      await updatePlayer(p.id, fields);
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <tr key={p.id}>
                    <td className="num">{p.num}</td>
                    <td>{p.name}</td>
                    <td>{posAbbr(p.position)}</td>
                    {canManage && (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn sm ghost" onClick={() => setEditingId(p.id)}>Editar</button>{" "}
                        <button type="button" className="btn sm danger" onClick={() => deactivatePlayer(p.id)}>Remover</button>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {canManage && inactive.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn sm ghost" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Ocultar" : "Ver"} atletas removidos ({inactive.length})
          </button>
          {showInactive && (
            <div className="tablewrap">
              <table>
                <tbody>
                  {inactive.map((p) => (
                    <tr key={p.id} style={{ color: "var(--ink-dim)" }}>
                      <td className="num">#{p.num}</td>
                      <td>{p.name}</td>
                      <td>{posAbbr(p.position)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn sm ghost" onClick={() => reactivatePlayer(p.id)}>Reativar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {canManage && (
        <>
          <div style={{ marginTop: 20 }}>
            <h3 className="section-title">Adicionar atleta</h3>
            <form onSubmit={handleAdd} className="inline-fields">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Nº</label>
                <input value={num} onInput={(e) => setNum((e.target as HTMLInputElement).value)} style={{ width: 60 }} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Nome</label>
                <input required value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ width: 200 }} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Posição</label>
                <select value={position} onChange={(e) => setPosition((e.target as HTMLSelectElement).value as Position)}>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn primary" disabled={addStatus === "saving"}>
                Adicionar
              </button>
            </form>
            {addStatus === "error" && <p className="banner error" style={{ marginTop: 8 }}>{addError}</p>}
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 className="section-title">Importar colando do Excel</h3>
            <p className="hint">
              Cola as linhas (Nº, Nome, Posição). Atualiza quem já existe (casando pelo nome), acrescenta quem for
              novo, nunca remove ninguém sozinho.
            </p>
            <textarea
              className="exportbox"
              value={importText}
              onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
            />
            <button type="button" className="btn primary" onClick={handleImport} disabled={importStatus === "saving"} style={{ marginTop: 8 }}>
              {importStatus === "saving" ? "A importar..." : "Importar / Atualizar plantel"}
            </button>
            {importSummary && <p className="hint" style={{ marginTop: 8 }}>{importSummary}</p>}
          </div>
        </>
      )}
    </div>
  );
}
