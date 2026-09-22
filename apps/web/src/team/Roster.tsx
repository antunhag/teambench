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
    <tr style={{ borderTop: "1px solid #eee" }}>
      <td style={{ padding: "6px 0" }}>
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
      <td style={{ textAlign: "right" }}>
        <button type="button" onClick={() => onSave({ num, name, position })}>Salvar</button>{" "}
        <button type="button" onClick={onCancel}>Cancelar</button>
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

  if (status === "loading") return <p>A carregar plantel...</p>;
  if (status === "error") return <p style={{ color: "crimson" }}>Erro: {errorMessage}</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16 }}>Plantel ({active.length})</h2>
      {active.length === 0 ? (
        <p style={{ color: "#666" }}>Ainda sem atletas.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#666", fontSize: 12 }}>
              <th>Nº</th>
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
                <tr key={p.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "6px 0" }}>{p.num}</td>
                  <td>{p.name}</td>
                  <td>{posAbbr(p.position)}</td>
                  {canManage && (
                    <td style={{ textAlign: "right" }}>
                      <button type="button" onClick={() => setEditingId(p.id)}>Editar</button>{" "}
                      <button type="button" onClick={() => deactivatePlayer(p.id)}>Remover</button>
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      {canManage && inactive.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setShowInactive((v) => !v)} style={{ fontSize: 12 }}>
            {showInactive ? "Ocultar" : "Ver"} atletas removidos ({inactive.length})
          </button>
          {showInactive && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 6 }}>
              <tbody>
                {inactive.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid #eee", color: "#666" }}>
                    <td style={{ padding: "6px 0" }}>#{p.num}</td>
                    <td>{p.name}</td>
                    <td>{posAbbr(p.position)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" onClick={() => reactivatePlayer(p.id)}>Reativar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {canManage && (
        <>
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 14 }}>Adicionar atleta</h3>
            <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label>
                Nº
                <input value={num} onInput={(e) => setNum((e.target as HTMLInputElement).value)} style={{ display: "block", width: 60 }} />
              </label>
              <label>
                Nome
                <input required value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ display: "block", width: 200 }} />
              </label>
              <label>
                Posição
                <select
                  value={position}
                  onChange={(e) => setPosition((e.target as HTMLSelectElement).value as Position)}
                  style={{ display: "block" }}
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={addStatus === "saving"}>
                Adicionar
              </button>
            </form>
            {addStatus === "error" && <p style={{ color: "crimson" }}>{addError}</p>}
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 14 }}>Importar colando do Excel</h3>
            <p style={{ color: "#666", fontSize: 12 }}>
              Cola as linhas (Nº, Nome, Posição). Atualiza quem já existe (casando pelo nome), acrescenta quem for
              novo, nunca remove ninguém sozinho.
            </p>
            <textarea
              value={importText}
              onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
              style={{ width: "100%", minHeight: 100, fontFamily: "monospace" }}
            />
            <button type="button" onClick={handleImport} disabled={importStatus === "saving"} style={{ marginTop: 8 }}>
              {importStatus === "saving" ? "A importar..." : "Importar / Atualizar plantel"}
            </button>
            {importSummary && <p style={{ marginTop: 8 }}>{importSummary}</p>}
          </div>
        </>
      )}
    </div>
  );
}
