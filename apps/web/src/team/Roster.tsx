import * as engine from "@teambench/engine";
import { useState } from "preact/hooks";
import { toErrorMessage } from "../errorMessage";
import { isLegacyAla, LEGACY_ALA, POSITIONS, posAbbr, type Position } from "./positions";
import { usePlayerAptitudes } from "./usePlayerAptitudes";
import { usePlayers, type PlayerRow } from "./usePlayers";
import { useResourceLock } from "./useResourceLock";

interface Props {
  teamId: string;
  canManage: boolean; // só team_admin gerencia o plantel
}

/** Valor de cada select de classificação: "" = não joga essa vaga, "unclassified" = joga mas ainda sem nota, senão a letra A/B/C. */
type QualityValue = "" | "unclassified" | engine.AptitudeQuality;

function qualityValueFor(bySlot: engine.AptitudeBySlot, slot: engine.RotationSlotType): QualityValue {
  if (!(slot in bySlot)) return "";
  return bySlot[slot] ?? "unclassified";
}

/** Monta o AptitudeBySlot a partir dos 4 selects — vaga "não joga" simplesmente não entra no objeto. */
function buildAptitudeBySlot(quality: Record<engine.RotationSlotType, QualityValue>): engine.AptitudeBySlot {
  const out: engine.AptitudeBySlot = {};
  engine.ROTATION_SLOT_TYPES.forEach((slot) => {
    const v = quality[slot];
    if (v === "") return;
    out[slot] = v === "unclassified" ? null : v;
  });
  return out;
}

function EditRow({
  p,
  aptitude,
  columnCount,
  onSave,
  onCancel,
}: {
  p: PlayerRow;
  aptitude: engine.AptitudeBySlot;
  columnCount: number;
  onSave: (fields: { num: string; name: string; position: Position }, aptitude: engine.AptitudeBySlot) => void;
  onCancel: () => void;
}) {
  const [num, setNum] = useState(p.num ?? "");
  const [name, setName] = useState(p.name);
  const [position, setPosition] = useState<Position>(p.position ?? "Universal");
  const [quality, setQuality] = useState<Record<engine.RotationSlotType, QualityValue>>(() => {
    const init = {} as Record<engine.RotationSlotType, QualityValue>;
    engine.ROTATION_SLOT_TYPES.forEach((slot) => {
      init[slot] = qualityValueFor(aptitude, slot);
    });
    return init;
  });

  function changeQuality(slot: engine.RotationSlotType, value: QualityValue) {
    setQuality((prev) => ({ ...prev, [slot]: value }));
  }

  return (
    <>
      <tr>
        <td>
          <input value={num} onInput={(e) => setNum((e.target as HTMLInputElement).value)} style={{ width: 50 }} />
        </td>
        <td>
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} style={{ width: 160 }} />
        </td>
        <td>
          <select value={position} onChange={(e) => setPosition((e.target as HTMLSelectElement).value as Position)}>
            {isLegacyAla(p.position) && (
              <option value={LEGACY_ALA} disabled>Ala (defina Esquerda ou Direita)</option>
            )}
            {POSITIONS.map((pos) => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </td>
        <td />
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <button type="button" className="btn sm primary" onClick={() => onSave({ num, name, position }, buildAptitudeBySlot(quality))}>Salvar</button>{" "}
          <button type="button" className="btn sm ghost" onClick={onCancel}>Cancelar</button>
        </td>
      </tr>
      <tr>
        <td colSpan={columnCount} style={{ paddingTop: 0 }}>
          <div className="hint" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span>Aptidões por vaga:</span>
            {engine.ROTATION_SLOT_TYPES.map((slot) => (
              <label key={slot} style={{ display: "flex", flexDirection: "column", gap: 1, fontSize: 10.5 }}>
                {slot}
                <select value={quality[slot]} onChange={(e) => changeQuality(slot, e.currentTarget.value as QualityValue)}>
                  <option value="">Não joga</option>
                  <option value="unclassified">Sem classificação</option>
                  <option value="C">C — apoio</option>
                  <option value="B">B — rotação</option>
                  <option value="A">A — primeira opção</option>
                </select>
              </label>
            ))}
          </div>
        </td>
      </tr>
    </>
  );
}

export function Roster({ teamId, canManage }: Props) {
  const { players, status, errorMessage, addPlayer, updatePlayer, deactivatePlayer, reactivatePlayer, bulkImport } = usePlayers(teamId);
  const aptitudes = usePlayerAptitudes(teamId);
  const active = players.filter((p) => p.active);
  const inactive = players.filter((p) => !p.active);
  const columnCount = canManage ? 5 : 4; // Nº, Nome, Posição, Aptidões, (Ações)

  const [num, setNum] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState<Position>("Universal");
  const [addStatus, setAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [addError, setAddError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [aptitudeError, setAptitudeError] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Trava da tela inteira (não por atleta — ver FR-005 da spec), só entra em
  // disputa quando alguém de facto abre uma edição, nunca só por ver a lista.
  const lock = useResourceLock(teamId, "roster", editingId !== null);

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
      setAddError(toErrorMessage(err));
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
      setImportSummary(`Erro: ${toErrorMessage(err)}`);
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
                <th>Aptidões</th>
                {canManage && <th className="actions-col" />}
              </tr>
            </thead>
            <tbody>
              {active.map((p) => {
                const bySlot = aptitudes.byPlayer[p.id] ?? {};
                if (canManage && editingId === p.id && lock.status === "checking") {
                  return (
                    <tr key={p.id}>
                      <td colSpan={columnCount} className="hint">A verificar...</td>
                    </tr>
                  );
                }
                if (canManage && editingId === p.id && lock.status === "readonly") {
                  return (
                    <tr key={p.id}>
                      <td colSpan={columnCount}>
                        <div className="banner warn" style={{ margin: 0 }}>
                          O Plantel está a ser editado por outra pessoa agora.{" "}
                          <button type="button" className="btn sm ghost" onClick={() => setEditingId(null)}>Fechar</button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return canManage && editingId === p.id ? (
                  <EditRow
                    key={p.id}
                    p={p}
                    aptitude={bySlot}
                    columnCount={columnCount}
                    onCancel={() => setEditingId(null)}
                    onSave={async (fields, newBySlot) => {
                      await updatePlayer(p.id, fields);
                      try {
                        await aptitudes.saveAptitudes(p.id, newBySlot);
                        setAptitudeError("");
                      } catch (err) {
                        setAptitudeError(toErrorMessage(err));
                      }
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <tr key={p.id}>
                    <td className="num">{p.num}</td>
                    <td>{p.name}</td>
                    <td
                      title={isLegacyAla(p.position) ? "Posição antiga \"Ala\" — defina Esquerda ou Direita." : undefined}
                      style={isLegacyAla(p.position) ? { color: "#c0392b", fontWeight: 700 } : undefined}
                    >
                      {posAbbr(p.position)}
                    </td>
                    <td className="hint">
                      {engine.sortedAptitudeSlots(bySlot).map((slot) => engine.aptitudeLabel(slot, bySlot[slot])).join(" › ") || "—"}
                    </td>
                    {canManage && (
                      <td className="actions-col" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn sm ghost" onClick={() => setEditingId(p.id)}>Editar</button>{" "}
                        <button type="button" className="btn sm danger" onClick={() => deactivatePlayer(p.id)}>Remover</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {aptitudeError && <p className="banner error" style={{ marginTop: 8 }}>Não consegui guardar a aptidão — {aptitudeError}</p>}

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
                      <td className="actions-col" style={{ textAlign: "right" }}>
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
