import { useState } from "preact/hooks";
import { useMatchFormats } from "./useMatchFormats";
import { useMatches } from "./useMatches";

interface Props {
  teamId: string;
  canManage: boolean;
}

export function Calendar({ teamId, canManage }: Props) {
  const { matches, status, errorMessage, bulkImport } = useMatches(teamId);
  const { formats } = useMatchFormats(teamId);
  const defaultFormat = formats.find((f) => f.isDefault) ?? null;

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
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "6px 0" }}>{m.matchDate.split("-").reverse().join("/")}</td>
                <td>{m.opponent}</td>
                <td>{m.competition}</td>
                <td>{m.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && (
        <div style={{ marginTop: 12 }}>
          {!defaultFormat && (
            <p style={{ color: "#a60", fontSize: 13 }}>
              ⚠️ Defina um formato de jogo padrão acima antes de importar — os jogos novos vão usá-lo automaticamente.
            </p>
          )}
          <p style={{ color: "#666", fontSize: 12 }}>
            Cola as linhas (Data, Adversário, Competição, Local, Hora). Data em dd/mm/aaaa. Casa jogos já
            existentes por data+adversário — não duplica ao colar de novo.
          </p>
          <textarea
            value={importText}
            onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
            style={{ width: "100%", minHeight: 100, fontFamily: "monospace" }}
          />
          <button type="button" onClick={handleImport} disabled={importStatus === "saving"} style={{ marginTop: 8 }}>
            {importStatus === "saving" ? "A importar..." : "Importar calendário"}
          </button>
          {importSummary && <p style={{ marginTop: 8 }}>{importSummary}</p>}
        </div>
      )}
    </div>
  );
}
