import { useState } from "preact/hooks";
import { toErrorMessage } from "../errorMessage";
import { useMatchFormats } from "./useMatchFormats";
import { useResourceLock } from "./useResourceLock";

interface Props {
  teamId: string;
  canManage: boolean;
}

/** Duração de jogo configurável — cada equipa/competição pode ter a sua (ver plano: match_formats). */
export function MatchFormats({ teamId, canManage }: Props) {
  const { formats, status, errorMessage, addFormat, setDefault, updateFormat } = useMatchFormats(teamId);

  const [name, setName] = useState("");
  const [periodCount, setPeriodCount] = useState(2);
  const [periodMinutes, setPeriodMinutes] = useState(25);
  const [overtimePeriodCount, setOvertimePeriodCount] = useState(0);
  const [overtimeMinutes, setOvertimeMinutes] = useState(0);
  // String (não number) pra aceitar vazio = "sem mínimo configurado" (null) —
  // specs/007-convocados-sync/ US3.
  const [minConvocados, setMinConvocados] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Não existia nenhum "modo de edição" aqui (só o formulário de adicionar)
  // — formatos já criados (ex.: usados em jogos reais) não tinham como
  // ganhar um minConvocados depois de criados (specs/007-convocados-sync/
  // research.md Decisão 6). `editingId` é null = criando um formato novo;
  // com valor = editando esse formato existente, mesmo formulário reaproveitado.
  const [editingId, setEditingId] = useState<string | null>(null);

  // O sinal de "a editar" é ter começado a preencher o nome (criar) ou estar
  // em modo de edição de um formato existente — mesmo espírito do
  // editingId do Plantel: nunca trava só por ver a lista (FR-006), só
  // quando há de facto uma edição em curso.
  const lock = useResourceLock(teamId, "match_format", name !== "" || editingId !== null);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPeriodCount(2);
    setPeriodMinutes(25);
    setOvertimePeriodCount(0);
    setOvertimeMinutes(0);
    setMinConvocados("");
  }

  function startEdit(f: (typeof formats)[number]) {
    setEditingId(f.id);
    setName(f.name);
    setPeriodCount(f.periodCount);
    setPeriodMinutes(f.periodMinutes);
    setOvertimePeriodCount(f.overtimePeriodCount);
    setOvertimeMinutes(f.overtimeMinutes);
    setMinConvocados(f.minConvocados != null ? String(f.minConvocados) : "");
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveError("");
    const input = {
      name,
      periodCount,
      periodMinutes,
      overtimePeriodCount,
      overtimeMinutes,
      minConvocados: minConvocados.trim() === "" ? null : Number(minConvocados),
    };
    try {
      if (editingId) {
        await updateFormat(editingId, input);
      } else {
        await addFormat(input, formats.length === 0); // o primeiro formato criado já vira o padrão automaticamente
      }
      resetForm();
      setSaveStatus("idle");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(toErrorMessage(err));
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
                  {f.minConvocados != null ? ` · mín. ${f.minConvocados} convocados` : ""}
                </div>
              </div>
              {canManage && (
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {!f.isDefault && (
                    <button type="button" className="btn sm ghost" onClick={() => setDefault(f.id)}>
                      Tornar padrão
                    </button>
                  )}
                  <button type="button" className="btn sm ghost" onClick={() => startEdit(f)}>
                    Editar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && lock.status === "readonly" && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          O Formato de Jogo está a ser editado por outra pessoa agora.{" "}
          <button type="button" className="btn sm ghost" onClick={resetForm}>Fechar</button>
        </div>
      )}
      {canManage && lock.status !== "readonly" && (
        <form onSubmit={handleSubmit} className="inline-fields" style={{ marginTop: 12 }}>
          {editingId && <p className="hint" style={{ width: "100%", margin: "0 0 4px" }}>A editar "{name}".</p>}
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
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Mín. convocados</label>
            <input
              type="number"
              min={1}
              placeholder="opcional"
              value={minConvocados}
              onInput={(e) => setMinConvocados((e.target as HTMLInputElement).value)}
              style={{ width: 90 }}
            />
          </div>
          <button type="submit" className="btn primary" disabled={saveStatus === "saving" || lock.status === "checking"}>
            {editingId ? "Guardar" : "Adicionar formato"}
          </button>
          {editingId && (
            <button type="button" className="btn ghost" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </form>
      )}
      {saveStatus === "error" && <p className="banner error" style={{ marginTop: 8 }}>{saveError}</p>}
    </div>
  );
}
