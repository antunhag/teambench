import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { usePlayers, type PlayerRow } from "../team/usePlayers";
import { PlayerChip, Sheet } from "./PickerUI";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  onClose: () => void;
}

interface EventRow {
  id: string;
  period: number;
  ms: number;
  payload: Record<string, unknown>;
}

interface Draft {
  period: string;
  time: string;
  playerId: string | null;
  assistId: string | null;
  outId: string | null;
  tipo: string | null;
  zona: number | null;
}

type DetailPicker = { rowId: string; kind: "player" | "scorer" | "assist" | "in" | "out" | "tipo" | "zona" } | null;

// Sentinela do formulário "+ Adicionar evento" — os mesmos overlays de
// escolher jogador/tipo/zona servem tanto para corrigir uma linha existente
// quanto para preencher um evento novo, distinguindo só por este id.
const NEW_ROW_ID = "__new__";

const ADDABLE_TYPES: { id: engine.EventType; label: string }[] = [
  { id: "substituicao", label: "Substituição" },
  { id: "golo", label: "Golo (nosso)" },
  { id: "golo_sofrido", label: "Golo sofrido" },
  { id: "cartao_amarelo", label: "Cartão amarelo" },
  { id: "cartao_vermelho", label: "Cartão vermelho" },
  { id: "falta", label: "Falta cometida" },
  { id: "falta_sofrida", label: "Falta sofrida" },
  { id: "pausa", label: "Pausa" },
  { id: "fim_pausa", label: "Fim de pausa" },
  { id: "lesao_inicio", label: "Início de atendimento" },
  { id: "lesao_fim", label: "Fim de atendimento" },
  { id: "kickoff", label: "Início da parte" },
  { id: "fim_periodo", label: "Fim da parte" },
];

function fmtMinSec(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function parseMinSec(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
}

function draftFromRow(r: EventRow): Draft {
  const p = r.payload as Partial<engine.MatchEvent>;
  return {
    period: String(r.period),
    time: fmtMinSec(r.ms),
    playerId: p.playerId ?? null,
    assistId: p.assistId ?? null,
    outId: p.outId ?? null,
    tipo: p.tipo ?? null,
    zona: p.zona ?? null,
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return a.period === b.period && a.time === b.time && a.playerId === b.playerId && a.assistId === b.assistId &&
    a.outId === b.outId && a.tipo === b.tipo && a.zona === b.zona;
}

/**
 * Corrige eventos já sincronizados — tempo/parte, mas também quem fez o quê
 * (marcador, assistência, quem entrou/saiu, tipo/zona do golo) — usando os
 * mesmos seletores de jogador do jogo ao vivo (ver PickerUI.tsx). Existe
 * porque parar o jogo ao vivo pra corrigir um detalhe é pior do que deixar
 * passar e revisar depois com calma (ver vídeo do jogo).
 *
 * Lê e grava direto no Supabase — não no localStorage de nenhum aparelho —
 * porque quem revê um jogo já jogado normalmente não é o mesmo
 * dispositivo/sessão que o registou ao vivo.
 *
 * Também deixa ADICIONAR um evento esquecido (ex.: uma substituição que
 * passou em branco ao vivo — afeta quem estava em campo dali pra frente,
 * então o tempo em quadra e o "em quadra" registado nos golos seguintes
 * também mudam). Eventos são só-acrescenta por desenho (ver 0001_init.sql)
 * — não existe política de DELETE, só de INSERT/UPDATE — por isso não dá
 * pra apagar um evento errado aqui, só corrigir seus dados ou acrescentar
 * o que faltou.
 */
export function MatchEventEditor({ teamId, matchId, opponent, onClose }: Props) {
  const { players: roster } = usePlayers(teamId);
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<DetailPicker>(null);

  const [newType, setNewType] = useState<engine.EventType>("substituicao");
  const [newPeriod, setNewPeriod] = useState("1");
  const [newTime, setNewTime] = useState("00:00");
  const [newPlayerId, setNewPlayerId] = useState<string | null>(null);
  const [newAssistId, setNewAssistId] = useState<string | null>(null);
  const [newOutId, setNewOutId] = useState<string | null>(null);
  const [newTipo, setNewTipo] = useState<string | null>(null);
  const [newZona, setNewZona] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [addError, setAddError] = useState("");

  function resetNewForm() {
    setNewPlayerId(null);
    setNewAssistId(null);
    setNewOutId(null);
    setNewTipo(null);
    setNewZona(null);
    setNewLabel("");
  }

  function newEventValid(): boolean {
    if (parseMinSec(newTime) == null) return false;
    const period = parseInt(newPeriod, 10);
    if (!Number.isFinite(period) || period < 1) return false;
    switch (newType) {
      case "golo":
      case "cartao_amarelo":
      case "cartao_vermelho":
      case "falta":
      case "falta_sofrida":
      case "lesao_inicio":
      case "lesao_fim":
      case "substituicao":
        return !!newPlayerId;
      case "pausa":
        return newLabel.trim().length > 0;
      default:
        return true;
    }
  }

  async function addEvent() {
    const ms = parseMinSec(newTime);
    const period = parseInt(newPeriod, 10);
    if (ms == null || !newEventValid()) return;
    const extra: Partial<engine.MatchEvent> = {};
    if (newType === "golo") {
      extra.assistId = newAssistId;
      extra.tipo = newTipo;
      extra.zona = newZona;
    }
    if (newType === "golo_sofrido") {
      extra.tipo = newTipo;
      extra.zona = newZona;
    }
    if (newType === "substituicao") extra.outId = newOutId;
    if (newType === "pausa" || newType === "fim_pausa") extra.label = newLabel || undefined;
    const ev = engine.createEvent(newType, newPlayerId, ms, period, Date.now(), extra);
    setAddStatus("saving");
    const { error } = await supabase.from("match_events").insert({
      client_event_id: ev.clientEventId,
      match_id: matchId,
      team_id: teamId,
      type: ev.type,
      player_id: ev.playerId,
      payload: ev as unknown as Record<string, unknown>,
      ms: ev.ms,
      min: ev.min,
      sec: ev.sec,
      period: ev.period,
    });
    if (error) {
      setAddStatus("error");
      setAddError(error.message);
      return;
    }
    setAddStatus("idle");
    setAddError("");
    resetNewForm();
    await load();
  }

  function applyPickerField(field: "playerId" | "assistId" | "outId" | "tipo" | "zona", value: string | number | null) {
    if (!picker) return;
    if (picker.rowId === NEW_ROW_ID) {
      if (field === "playerId") setNewPlayerId(value as string | null);
      if (field === "assistId") setNewAssistId(value as string | null);
      if (field === "outId") setNewOutId(value as string | null);
      if (field === "tipo") setNewTipo(value as string | null);
      if (field === "zona") setNewZona(value as number | null);
    } else {
      setDraftField(picker.rowId, { [field]: value } as Partial<Draft>);
    }
    setPicker(null);
  }

  function byId(id: string) {
    const p = roster.find((x) => x.id === id);
    return p ? { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" } : undefined;
  }

  function playerLabel(id: string | null): string {
    if (!id) return "—";
    const p = roster.find((x) => x.id === id);
    return p ? `#${p.num} ${p.name}` : "?";
  }

  async function load() {
    setStatus("loading");
    const { data, error } = await supabase
      .from("match_events")
      .select("id, period, ms, payload")
      .eq("match_id", matchId)
      .order("period", { ascending: true })
      .order("ms", { ascending: true });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    const loaded = (data ?? []) as EventRow[];
    setRows(loaded);
    setDrafts(Object.fromEntries(loaded.map((r) => [r.id, draftFromRow(r)])));
    setStatus("ready");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function saveRow(row: EventRow) {
    const draft = drafts[row.id];
    const ms = draft ? parseMinSec(draft.time) : null;
    const period = draft ? parseInt(draft.period, 10) : NaN;
    if (!draft || ms == null || !Number.isFinite(period) || period < 1) return;
    setSavingId(row.id);
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const payload = {
      ...row.payload,
      ms,
      min,
      sec,
      period,
      playerId: draft.playerId,
      assistId: draft.assistId,
      outId: draft.outId,
      tipo: draft.tipo,
      zona: draft.zona,
    };
    const { error } = await supabase
      .from("match_events")
      .update({ ms, min, sec, period, player_id: draft.playerId, payload })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setErrorMessage("");
    setSavedIds((prev) => new Set(prev).add(row.id));
    setRows((prev) =>
      (prev ?? [])
        .map((r) => (r.id === row.id ? { ...r, ms, period, payload } : r))
        .sort((a, b) => (a.period - b.period) || (a.ms - b.ms))
    );
  }

  function setDraftField(rowId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [rowId]: { ...d[rowId], ...patch } }));
  }

  function detailButtons(r: EventRow, draft: Draft) {
    const type = (r.payload as { type?: string }).type;
    const btn = (label: string, kind: NonNullable<DetailPicker>["kind"]) => (
      <button
        key={kind}
        type="button"
        className="btn sm ghost"
        onClick={() => setPicker({ rowId: r.id, kind })}
        style={{ marginRight: 4, marginBottom: 4 }}
      >
        {label}
      </button>
    );
    switch (type) {
      case "golo":
        return (
          <>
            {btn(`Marcador: ${playerLabel(draft.playerId)}`, "scorer")}
            {btn(`Assist.: ${playerLabel(draft.assistId)}`, "assist")}
            {btn(`Tipo: ${engine.tipoGoloLabel(draft.tipo) ?? "—"}`, "tipo")}
            {btn(`Zona: ${draft.zona ?? "—"}`, "zona")}
          </>
        );
      case "golo_sofrido":
        return (
          <>
            {btn(`Tipo: ${engine.tipoGoloLabel(draft.tipo) ?? "—"}`, "tipo")}
            {btn(`Zona: ${draft.zona ?? "—"}`, "zona")}
          </>
        );
      case "cartao_amarelo":
      case "cartao_vermelho":
      case "falta":
      case "falta_sofrida":
      case "lesao_inicio":
      case "lesao_fim":
        return btn(`Jogador: ${playerLabel(draft.playerId)}`, "player");
      case "substituicao":
        return (
          <>
            {btn(`Entra: ${playerLabel(draft.playerId)}`, "in")}
            {btn(`Sai: ${playerLabel(draft.outId)}`, "out")}
          </>
        );
      default:
        return null;
    }
  }

  function newDetailButtons() {
    const btn = (label: string, kind: NonNullable<DetailPicker>["kind"]) => (
      <button
        key={kind}
        type="button"
        className="btn sm ghost"
        onClick={() => setPicker({ rowId: NEW_ROW_ID, kind })}
        style={{ marginRight: 4, marginBottom: 4 }}
      >
        {label}
      </button>
    );
    switch (newType) {
      case "golo":
        return (
          <>
            {btn(`Marcador: ${playerLabel(newPlayerId)}`, "scorer")}
            {btn(`Assist.: ${playerLabel(newAssistId)}`, "assist")}
            {btn(`Tipo: ${engine.tipoGoloLabel(newTipo) ?? "—"}`, "tipo")}
            {btn(`Zona: ${newZona ?? "—"}`, "zona")}
          </>
        );
      case "golo_sofrido":
        return (
          <>
            {btn(`Tipo: ${engine.tipoGoloLabel(newTipo) ?? "—"}`, "tipo")}
            {btn(`Zona: ${newZona ?? "—"}`, "zona")}
          </>
        );
      case "cartao_amarelo":
      case "cartao_vermelho":
      case "falta":
      case "falta_sofrida":
      case "lesao_inicio":
      case "lesao_fim":
        return btn(`Jogador: ${playerLabel(newPlayerId)}`, "player");
      case "substituicao":
        return (
          <>
            {btn(`Entra: ${playerLabel(newPlayerId)}`, "in")}
            {btn(`Sai: ${playerLabel(newOutId)}`, "out")}
          </>
        );
      case "pausa":
      case "fim_pausa":
        return (
          <input
            type="text"
            placeholder="Motivo (ex.: Pedido de Tempo — Nós)"
            value={newLabel}
            onInput={(e) => setNewLabel((e.target as HTMLInputElement).value)}
            style={{ width: 240 }}
          />
        );
      default:
        return null;
    }
  }

  const pickerRow = picker ? rows?.find((r) => r.id === picker.rowId) : undefined;
  const pickerIsNew = picker?.rowId === NEW_ROW_ID;

  return (
    <div>
      <button type="button" className="btn sm ghost" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Voltar
      </button>
      <h2 style={{ fontSize: 18 }}>Corrigir registo — vs {opponent}</h2>
      <p className="hint">
        Ajusta parte, tempo e quem fez o quê em cada evento e toca em "Salvar" — grava direto no Supabase, sem
        depender do aparelho que registou o jogo. Não dá para apagar eventos aqui (o registo é só-acrescenta por
        desenho); só corrigir os dados de eventos que já existem, ou acrescentar um que passou em branco.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="hint" style={{ marginTop: 0, fontWeight: 600 }}>+ Adicionar evento esquecido</p>
        <div className="inline-fields">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select
              value={newType}
              onChange={(e) => {
                setNewType((e.target as HTMLSelectElement).value as engine.EventType);
                resetNewForm();
              }}
            >
              {ADDABLE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Parte</label>
            <input type="number" min={1} value={newPeriod} onInput={(e) => setNewPeriod((e.target as HTMLInputElement).value)} style={{ width: 48 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Tempo</label>
            <input
              type="text"
              inputMode="numeric"
              value={newTime}
              onInput={(e) => setNewTime((e.target as HTMLInputElement).value)}
              style={{ width: 64 }}
            />
          </div>
        </div>
        <div style={{ marginTop: 8 }}>{newDetailButtons()}</div>
        <button
          type="button"
          className="btn primary"
          disabled={!newEventValid() || addStatus === "saving"}
          onClick={addEvent}
          style={{ marginTop: 8 }}
        >
          {addStatus === "saving" ? "A adicionar..." : "Adicionar"}
        </button>
        {addStatus === "error" && <p className="banner error" style={{ marginTop: 8 }}>{addError}</p>}
      </div>

      {status === "loading" && <p className="empty">A carregar registo...</p>}
      {status === "error" && <p className="banner error">Erro: {errorMessage}</p>}

      {status === "ready" && rows && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Parte</th>
                <th>Tempo</th>
                <th>Evento / detalhes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const draft = drafts[r.id] ?? draftFromRow(r);
                const dirty = !draftsEqual(draft, draftFromRow(r));
                const previewMs = parseMinSec(draft.time) ?? r.ms;
                const previewPeriod = parseInt(draft.period, 10) || r.period;
                const preview: engine.MatchEvent = {
                  ...(r.payload as unknown as engine.MatchEvent),
                  ms: previewMs,
                  period: previewPeriod,
                  playerId: draft.playerId,
                  assistId: draft.assistId,
                  outId: draft.outId,
                  tipo: draft.tipo,
                  zona: draft.zona,
                };
                return (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={draft.period}
                        onInput={(e) => setDraftField(r.id, { period: (e.target as HTMLInputElement).value })}
                        style={{ width: 48 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft.time}
                        onInput={(e) => setDraftField(r.id, { time: (e.target as HTMLInputElement).value })}
                        style={{ width: 64 }}
                      />
                    </td>
                    <td className="d">
                      <div>{engine.describeEvent(preview, byId)}</div>
                      <div style={{ marginTop: 4 }}>{detailButtons(r, draft)}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={!dirty || savingId === r.id}
                        onClick={() => saveRow(r)}
                      >
                        {savingId === r.id ? "..." : savedIds.has(r.id) && !dirty ? "✅" : "Salvar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {errorMessage && status === "ready" && <p className="banner error" style={{ marginTop: 8 }}>{errorMessage}</p>}

      {picker && (pickerRow || pickerIsNew) && (picker.kind === "player" || picker.kind === "scorer" || picker.kind === "in") && (
        <Sheet title="Escolher jogador" onClose={() => setPicker(null)}>
          <div className="pgrid">
            {roster.map((p: PlayerRow) => (
              <PlayerChip key={p.id} p={p} onClick={() => applyPickerField("playerId", p.id)} />
            ))}
          </div>
        </Sheet>
      )}

      {picker && (pickerRow || pickerIsNew) && picker.kind === "assist" && (
        <Sheet title="Assistência" sub='Toca em "sem assistência" se não houver' onClose={() => setPicker(null)}>
          <div className="pgrid">
            {roster.map((p: PlayerRow) => (
              <PlayerChip key={p.id} p={p} onClick={() => applyPickerField("assistId", p.id)} />
            ))}
          </div>
          <button type="button" className="btn primary block" onClick={() => applyPickerField("assistId", null)} style={{ marginTop: 10 }}>
            Sem assistência
          </button>
        </Sheet>
      )}

      {picker && (pickerRow || pickerIsNew) && picker.kind === "out" && (
        <Sheet title="Quem saiu?" sub='Toca em "ninguém saiu" se entrou sem substituir ninguém' onClose={() => setPicker(null)}>
          <div className="pgrid">
            {roster.map((p: PlayerRow) => (
              <PlayerChip key={p.id} p={p} onClick={() => applyPickerField("outId", p.id)} />
            ))}
          </div>
          <button type="button" className="btn primary block" onClick={() => applyPickerField("outId", null)} style={{ marginTop: 10 }}>
            Ninguém saiu
          </button>
        </Sheet>
      )}

      {picker && picker.kind === "tipo" && (
        <Sheet title="Tipo de jogada?" onClose={() => setPicker(null)}>
          <div className="actiongrid">
            {engine.TIPOS_GOLO.map((t) => (
              <button key={t.id} type="button" className="abtn" onClick={() => applyPickerField("tipo", t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn ghost block" onClick={() => applyPickerField("tipo", null)} style={{ marginTop: 10 }}>
            Não sei / saltar
          </button>
        </Sheet>
      )}

      {picker && picker.kind === "zona" && (
        <Sheet title="Zona do golo?" sub="Grelha 3×4 (1-3 mais perto da baliza, 10-12 mais perto do meio-campo)" onClose={() => setPicker(null)}>
          <div className="zonegrid">
            {engine.ZONAS_GOLO.map((z) => (
              <button key={z} type="button" className="zbtn" onClick={() => applyPickerField("zona", z)}>
                {z}
              </button>
            ))}
          </div>
          <button type="button" className="btn ghost block" onClick={() => applyPickerField("zona", null)} style={{ marginTop: 10 }}>
            Não sei / saltar
          </button>
        </Sheet>
      )}
    </div>
  );
}
