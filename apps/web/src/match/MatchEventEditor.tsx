import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { supabase } from "../supabaseClient";
import { usePlayers, type PlayerRow } from "../team/usePlayers";
import { PlayerChip, Sheet } from "./PickerUI";
import { useMatchLock } from "./useMatchLock";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  onClose: () => void;
  /** Remover é a ação mais irreversível daqui — só Admin da Equipa, nunca Lançador de dados (ver 0011_match_events_delete.sql). */
  canDelete: boolean;
  /** Nome/sigla do clube — usado nos motivos de pausa ("Pedido de Tempo — {ourLabel}"), igual ao jogo ao vivo. */
  ourLabel: string;
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
  transicaoNumeros: string | null;
  transicaoBalizaDeserta: boolean;
  /** Quem estava em quadra no apito — só existe (e só importa) em eventos "kickoff". */
  lineup: string[] | null;
  /** Motivo da pausa — só existe (e só importa) em "pausa"/"fim_pausa". */
  reasonId: string | null;
  label: string;
}

type DetailPicker =
  | { rowId: string; kind: "player" | "scorer" | "assist" | "in" | "out" | "tipo" | "zona" | "transicao" | "lineup" | "motivo" }
  | null;

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((id) => bs.has(id));
}

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
    transicaoNumeros: p.transicaoNumeros ?? null,
    transicaoBalizaDeserta: p.transicaoBalizaDeserta ?? false,
    lineup: p.lineup ?? null,
    reasonId: p.reasonId ?? null,
    label: p.label ?? "",
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return a.period === b.period && a.time === b.time && a.playerId === b.playerId && a.assistId === b.assistId &&
    a.outId === b.outId && a.tipo === b.tipo && a.zona === b.zona && a.transicaoNumeros === b.transicaoNumeros &&
    a.transicaoBalizaDeserta === b.transicaoBalizaDeserta && a.reasonId === b.reasonId && a.label === b.label &&
    (a.lineup == null && b.lineup == null ? true : a.lineup != null && b.lineup != null && sameIds(a.lineup, b.lineup));
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
 * também mudam) e REMOVER um duplicado/errado (ex.: os lances presos em
 * ms=0 pelo bug do botão "Iniciar Parte N" sumido, depois de já
 * recriados com o tempo certo). Remover é a única ação daqui que sai do
 * "só-acrescenta" original (ver 0011_match_events_delete.sql) — por isso
 * fica restrita ao Admin da Equipa (`canDelete`), nunca ao Lançador de
 * dados.
 */
export function MatchEventEditor({ teamId, matchId, opponent, onClose, canDelete, ourLabel }: Props) {
  // Mesma trava do jogo ao vivo (useMatchLock, migração 0009), agora também
  // aqui — corrigir um jogo já terminado tem o mesmo risco de duas contas se
  // atropelarem que o jogo ao vivo já tinha, e a trava é por match_id, nunca
  // ligada a "está ao vivo" (ver specs/001-multi-user-access/research.md).
  const lock = useMatchLock(matchId);
  const { players: roster } = usePlayers(teamId);
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Confirmação de remover é feita aqui dentro (toca 2x), em vez de
  // window.confirm() — diálogos nativos podem ficar mudos em alguns
  // contextos de PWA instalado no telemóvel/tablet, fazendo o botão
  // parecer "sem ação" (o confirm() falha silenciosamente).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<DetailPicker>(null);

  const [newType, setNewType] = useState<engine.EventType>("substituicao");
  const [newPeriod, setNewPeriod] = useState("1");
  const [newTime, setNewTime] = useState("00:00");
  const [newPlayerId, setNewPlayerId] = useState<string | null>(null);
  const [newAssistId, setNewAssistId] = useState<string | null>(null);
  const [newOutId, setNewOutId] = useState<string | null>(null);
  const [newTipo, setNewTipo] = useState<string | null>(null);
  const [newZona, setNewZona] = useState<number | null>(null);
  const [newTransicaoNumeros, setNewTransicaoNumeros] = useState<string | null>(null);
  const [newBalizaDeserta, setNewBalizaDeserta] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newReasonId, setNewReasonId] = useState<string | null>(null);
  const [newLineup, setNewLineup] = useState<string[] | null>(null);
  const [addStatus, setAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [addError, setAddError] = useState("");
  const [transicaoCustom, setTransicaoCustom] = useState("");
  const [motivoCustom, setMotivoCustom] = useState("");

  function resetNewForm() {
    setNewPlayerId(null);
    setNewAssistId(null);
    setNewOutId(null);
    setNewTipo(null);
    setNewZona(null);
    setNewTransicaoNumeros(null);
    setNewBalizaDeserta(false);
    setNewLabel("");
    setNewReasonId(null);
    setNewLineup(null);
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
      extra.transicaoNumeros = newTipo === "trs" ? newTransicaoNumeros : null;
      extra.transicaoBalizaDeserta = newTipo === "trs" && newBalizaDeserta;
    }
    if (newType === "golo_sofrido") {
      extra.tipo = newTipo;
      extra.zona = newZona;
      extra.transicaoNumeros = newTipo === "trs" ? newTransicaoNumeros : null;
      extra.transicaoBalizaDeserta = newTipo === "trs" && newBalizaDeserta;
    }
    if (newType === "substituicao") extra.outId = newOutId;
    if (newType === "pausa" || newType === "fim_pausa") {
      extra.label = newLabel || undefined;
      extra.reasonId = newReasonId ?? undefined;
    }
    if (newType === "kickoff" && newLineup) extra.lineup = newLineup;
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

  function applyPickerField(field: "playerId" | "assistId" | "outId" | "tipo" | "zona" | "transicaoNumeros", value: string | number | null) {
    if (!picker) return;
    if (picker.rowId === NEW_ROW_ID) {
      if (field === "playerId") setNewPlayerId(value as string | null);
      if (field === "assistId") setNewAssistId(value as string | null);
      if (field === "outId") setNewOutId(value as string | null);
      if (field === "tipo") setNewTipo(value as string | null);
      if (field === "zona") setNewZona(value as number | null);
      if (field === "transicaoNumeros") setNewTransicaoNumeros(value as string | null);
    } else {
      setDraftField(picker.rowId, { [field]: value } as Partial<Draft>);
    }
    setPicker(null);
  }

  // "Baliza deserta" é um toggle, não uma escolha de lista — fica fora do
  // fluxo de applyPickerField (que sempre fecha o picker ao aplicar).
  function currentBalizaDeserta(): boolean {
    if (!picker) return false;
    return picker.rowId === NEW_ROW_ID ? newBalizaDeserta : (drafts[picker.rowId]?.transicaoBalizaDeserta ?? false);
  }

  function toggleBalizaDeserta() {
    if (!picker) return;
    if (picker.rowId === NEW_ROW_ID) setNewBalizaDeserta((v) => !v);
    else setDraftField(picker.rowId, { transicaoBalizaDeserta: !(drafts[picker.rowId]?.transicaoBalizaDeserta ?? false) });
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

  function lineupLabel(ids: string[] | null): string {
    if (!ids || ids.length === 0) return "— (toca pra escolher)";
    return ids.map((id) => `#${roster.find((p) => p.id === id)?.num ?? "?"}`).join(", ");
  }

  // "Em quadra" é seleção múltipla (até 5 jogadores), diferente de todos os
  // outros pickers (que escolhem um só e fecham na hora) — por isso fica de
  // fora do fluxo de applyPickerField, igual à "baliza deserta".
  function currentLineup(): string[] {
    if (!picker) return [];
    return (picker.rowId === NEW_ROW_ID ? newLineup : drafts[picker.rowId]?.lineup) ?? [];
  }

  function toggleLineupPlayer(id: string) {
    if (!picker) return;
    const current = currentLineup();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (picker.rowId === NEW_ROW_ID) setNewLineup(next);
    else setDraftField(picker.rowId, { lineup: next });
  }

  // Motivo da pausa junta duas colunas de uma vez (reasonId + label) — por
  // isso fica fora do applyPickerField genérico, igual à "baliza deserta"/"em quadra".
  function applyMotivo(reasonId: string | null, label: string) {
    if (!picker) return;
    if (picker.rowId === NEW_ROW_ID) {
      setNewReasonId(reasonId);
      setNewLabel(label);
    } else {
      setDraftField(picker.rowId, { reasonId, label });
    }
    setPicker(null);
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

  if (lock.status === "checking") {
    return <p className="empty">A verificar...</p>;
  }
  if (lock.status === "readonly") {
    return (
      <div>
        <button type="button" className="btn sm ghost" onClick={onClose} style={{ marginBottom: 12 }}>
          ← Voltar
        </button>
        <p className="banner warn">
          Este jogo está a ser corrigido por outra pessoa agora. Tente novamente dentro de alguns instantes.
        </p>
      </div>
    );
  }

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
      transicaoNumeros: draft.tipo === "trs" ? draft.transicaoNumeros : null,
      transicaoBalizaDeserta: draft.tipo === "trs" && draft.transicaoBalizaDeserta,
      lineup: draft.lineup,
      reasonId: draft.reasonId,
      label: draft.label,
    };
    // .select() confirma que a linha foi mesmo atualizada — sem ele, um
    // UPDATE bloqueado pela RLS devolveria "sucesso" mesmo sem mudar nada
    // (ver deleteRow, mesmo problema).
    const { data, error } = await supabase
      .from("match_events")
      .update({ ms, min, sec, period, player_id: draft.playerId, payload })
      .eq("id", row.id)
      .select("id");
    setSavingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErrorMessage("Não foi salvo — a conta usada não tem permissão para corrigir este jogo.");
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

  function requestDelete(row: EventRow) {
    if (confirmingId !== row.id) {
      setConfirmingId(row.id);
      // Confirmação expira sozinha — evita um "Confirmar" antigo ficar
      // pendurado na tela e ser tocado sem querer bem mais tarde.
      setTimeout(() => setConfirmingId((c) => (c === row.id ? null : c)), 4000);
      return;
    }
    setConfirmingId(null);
    void deleteRow(row);
  }

  async function deleteRow(row: EventRow) {
    setDeletingId(row.id);
    // .select() é essencial aqui: sem ele, um DELETE bloqueado pela RLS
    // (ex.: migração 0011 ainda não aplicada, ou conta sem papel de Admin)
    // devolve sucesso (error=null) mesmo tendo apagado ZERO linhas — o
    // Postgres não trata "0 linhas casaram o WHERE" como erro. Só o array
    // devolvido por .select() confirma que a linha saiu de verdade.
    const { data, error } = await supabase.from("match_events").delete().eq("id", row.id).select("id");
    setDeletingId(null);
    if (error) {
      setRowErrors((e) => ({ ...e, [row.id]: error.message }));
      return;
    }
    if (!data || data.length === 0) {
      setRowErrors((e) => ({
        ...e,
        [row.id]: "Não foi removido — confirme se a migração 0011_match_events_delete.sql já rodou e se esta conta é Admin da Equipa.",
      }));
      return;
    }
    setRowErrors((e) => {
      const { [row.id]: _removed, ...rest } = e;
      return rest;
    });
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
    setDrafts((d) => {
      const { [row.id]: _removed, ...rest } = d;
      return rest;
    });
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
            {draft.tipo === "trs" && btn(`Transição: ${draft.transicaoNumeros ?? "—"}${draft.transicaoBalizaDeserta ? " 🥅" : ""}`, "transicao")}
            {btn(`Zona: ${draft.zona ?? "—"}`, "zona")}
          </>
        );
      case "golo_sofrido":
        return (
          <>
            {btn(`Tipo: ${engine.tipoGoloLabel(draft.tipo) ?? "—"}`, "tipo")}
            {draft.tipo === "trs" && btn(`Transição: ${draft.transicaoNumeros ?? "—"}${draft.transicaoBalizaDeserta ? " 🥅" : ""}`, "transicao")}
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
      case "kickoff":
        return btn(`Em quadra: ${lineupLabel(draft.lineup)}`, "lineup");
      case "pausa":
      case "fim_pausa":
        return btn(`Motivo: ${draft.label || "—"}`, "motivo");
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
            {newTipo === "trs" && btn(`Transição: ${newTransicaoNumeros ?? "—"}${newBalizaDeserta ? " 🥅" : ""}`, "transicao")}
            {btn(`Zona: ${newZona ?? "—"}`, "zona")}
          </>
        );
      case "golo_sofrido":
        return (
          <>
            {btn(`Tipo: ${engine.tipoGoloLabel(newTipo) ?? "—"}`, "tipo")}
            {newTipo === "trs" && btn(`Transição: ${newTransicaoNumeros ?? "—"}${newBalizaDeserta ? " 🥅" : ""}`, "transicao")}
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
        return btn(`Motivo: ${newLabel || "—"}`, "motivo");
      case "kickoff":
        return btn(`Em quadra: ${lineupLabel(newLineup)}`, "lineup");
      default:
        return null;
    }
  }

  const pickerRow = picker ? rows?.find((r) => r.id === picker.rowId) : undefined;
  const pickerIsNew = picker?.rowId === NEW_ROW_ID;
  // Quem já foi escolhido como marcador (golo) ou como quem entra (substituição) não pode
  // ser escolhido de novo como assistência/quem sai — a mesma regra que o jogo ao vivo já aplica.
  const pickerCurrentPlayerId = picker ? (pickerIsNew ? newPlayerId : (drafts[picker.rowId]?.playerId ?? null)) : null;

  return (
    <div>
      <button type="button" className="btn sm ghost" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Voltar
      </button>
      <h2 style={{ fontSize: 18 }}>Corrigir registo — vs {opponent}</h2>
      <p className="hint">
        Ajusta parte, tempo e quem fez o quê em cada evento e toca em "Salvar" — grava direto no Supabase, sem
        depender do aparelho que registou o jogo. Também dá para acrescentar um evento que passou em branco{canDelete
          ? " ou remover um duplicado/errado (restrito ao Admin da Equipa)."
          : "."}
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
              {(() => {
                // "Em quadra" de cada golo recalculado do zero a partir da ordem
                // cronológica de TODAS as linhas (já com as edições ainda não
                // salvas aplicadas) — nunca do valor gravado em cada evento, que
                // fica desatualizado assim que uma substituição muda de tempo.
                function previewEventFor(row: EventRow): engine.MatchEvent {
                  const d = drafts[row.id] ?? draftFromRow(row);
                  return {
                    ...(row.payload as unknown as engine.MatchEvent),
                    // Sobrescreve o id do evento (interno, do payload) pelo id da
                    // linha no Supabase — é essa chave que describeEvents devolve
                    // e que o resto deste componente usa pra tudo (drafts, etc).
                    id: row.id,
                    ms: parseMinSec(d.time) ?? row.ms,
                    period: parseInt(d.period, 10) || row.period,
                    playerId: d.playerId,
                    assistId: d.assistId,
                    outId: d.outId,
                    tipo: d.tipo,
                    zona: d.zona,
                    transicaoNumeros: d.transicaoNumeros,
                    transicaoBalizaDeserta: d.transicaoBalizaDeserta,
                    lineup: d.lineup ?? undefined,
                    reasonId: d.reasonId ?? undefined,
                    label: d.label || undefined,
                  };
                }
                const descriptions = engine.describeEvents(rows.map(previewEventFor), byId);
                return rows.map((r) => {
                const draft = drafts[r.id] ?? draftFromRow(r);
                const dirty = !draftsEqual(draft, draftFromRow(r));
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
                      <div>{descriptions.get(r.id)}</div>
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
                      {canDelete && (
                        <div style={{ marginTop: 4 }}>
                          <button
                            type="button"
                            className="btn sm danger"
                            disabled={deletingId === r.id}
                            onClick={() => requestDelete(r)}
                          >
                            {deletingId === r.id ? "..." : confirmingId === r.id ? "Confirmar remoção?" : "Remover"}
                          </button>
                          {confirmingId === r.id && (
                            <button
                              type="button"
                              className="btn sm ghost"
                              onClick={() => setConfirmingId(null)}
                              style={{ marginTop: 4 }}
                            >
                              Cancelar
                            </button>
                          )}
                          {rowErrors[r.id] && (
                            <p className="banner error" style={{ marginTop: 4, fontSize: 12 }}>{rowErrors[r.id]}</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
                });
              })()}
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
            {roster
              .filter((p) => p.id !== pickerCurrentPlayerId) // ninguém dá assistência a si mesmo
              .map((p: PlayerRow) => (
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
            {roster
              .filter((p) => p.id !== pickerCurrentPlayerId) // quem entra não pode ser também quem sai
              .map((p: PlayerRow) => (
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
          <p className="sub" style={{ marginTop: 0 }}>⚽ Jogo aberto</p>
          <div className="actiongrid">
            {engine.TIPOS_GOLO_JOGO_ABERTO.map((t) => (
              <button key={t.id} type="button" className="abtn" onClick={() => applyPickerField("tipo", t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="sub">🎯 Bola parada</p>
          <div className="actiongrid">
            {engine.TIPOS_GOLO_BOLA_PARADA.map((t) => (
              <button key={t.id} type="button" className="abtn" onClick={() => applyPickerField("tipo", t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="sub">⚠️ Penalidades e situações especiais</p>
          <div className="actiongrid">
            {engine.TIPOS_GOLO_ESPECIAL.map((t) => (
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

      {picker && (pickerRow || pickerIsNew) && picker.kind === "transicao" && (
        <Sheet title="Tipo de transição?" onClose={() => setPicker(null)}>
          <p className="sub" style={{ marginTop: 0 }}>Superioridade numérica</p>
          <div className="actiongrid">
            {engine.TRANSICAO_NUMEROS_VANTAGEM.map((n) => (
              <button key={n} type="button" className="abtn" onClick={() => applyPickerField("transicaoNumeros", n)}>
                {n}
              </button>
            ))}
          </div>
          <p className="sub">Igualdade / outras</p>
          <div className="actiongrid">
            {engine.TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM.map((n) => (
              <button key={n} type="button" className="abtn" onClick={() => applyPickerField("transicaoNumeros", n)}>
                {n}
              </button>
            ))}
          </div>
          {/* Aqui (correção pós-jogo, sem pressão de tempo) mantém o texto livre — ao vivo isso foi removido de propósito. */}
          <form
            className="inline-fields"
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              const value = transicaoCustom.trim();
              if (!value) return;
              applyPickerField("transicaoNumeros", value);
              setTransicaoCustom("");
            }}
          >
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                type="text"
                placeholder="Outra (ex.: 2x3)"
                value={transicaoCustom}
                onInput={(e) => setTransicaoCustom((e.target as HTMLInputElement).value)}
                style={{ width: 120 }}
              />
            </div>
            <button type="submit" className="btn primary">Usar</button>
          </form>
          <button type="button" className="btn ghost block" onClick={() => applyPickerField("transicaoNumeros", null)} style={{ marginTop: 10 }}>
            Não sei / saltar
          </button>
          <p className="sub" style={{ marginBottom: 4 }}>Modificadores rápidos</p>
          <button
            type="button"
            className={`checkbox-chip${currentBalizaDeserta() ? " checked" : ""}`}
            onClick={toggleBalizaDeserta}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 8px 8px 26px" }}
          >
            🥅 Baliza deserta (goleiro-linha)
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

      {picker && (pickerRow || pickerIsNew) && picker.kind === "lineup" && (
        <Sheet
          title="Quem estava em quadra no apito?"
          sub="Toca pra marcar/desmarcar — normalmente são 5. Fecha quando terminar."
          onClose={() => setPicker(null)}
        >
          <div className="pgrid">
            {roster.map((p: PlayerRow) => {
              const selected = currentLineup().includes(p.id);
              return (
                <PlayerChip key={p.id} p={p} dim={!selected} onClick={() => toggleLineupPlayer(p.id)} />
              );
            })}
          </div>
          <button type="button" className="btn primary block" onClick={() => setPicker(null)} style={{ marginTop: 10 }}>
            Concluído ({currentLineup().length})
          </button>
        </Sheet>
      )}

      {picker && (pickerRow || pickerIsNew) && picker.kind === "motivo" && (
        <Sheet title="Motivo da pausa" sub="Toca num dos motivos, ou escreve outro abaixo" onClose={() => setPicker(null)}>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => applyMotivo("tempo_nos", `Pedido de Tempo — ${ourLabel}`)}
            style={{ marginBottom: 6, textAlign: "left" }}
          >
            Pedido de Tempo — {ourLabel}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => applyMotivo("tempo_advers", "Pedido de Tempo — Adversário")}
            style={{ marginBottom: 10, textAlign: "left" }}
          >
            Pedido de Tempo — Adversário
          </button>
          <form
            className="inline-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const value = motivoCustom.trim();
              if (!value) return;
              applyMotivo("outro", value);
              setMotivoCustom("");
            }}
          >
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <input
                type="text"
                placeholder="Outro motivo (ex.: lesão, árbitro)"
                value={motivoCustom}
                onInput={(e) => setMotivoCustom((e.target as HTMLInputElement).value)}
                style={{ width: "100%" }}
              />
            </div>
            <button type="submit" className="btn primary">Usar</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
