import * as engine from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import { toErrorMessage } from "../errorMessage";
import { useMatchFormats } from "../team/useMatchFormats";
import { isGoalkeeper, posAbbr } from "../team/positions";
import { usePlayerAptitudes } from "../team/usePlayerAptitudes";
import { usePlayers, type AvailabilityStatus, type PlayerRow } from "../team/usePlayers";
import { useRecentMinutes } from "./useRecentMinutes";
import { useRotationPlan } from "./useRotationPlan";
import { useRotationWeights } from "./useRotationWeights";

interface Props {
  teamId: string;
  matchId: string;
  opponent: string | null;
  formatId: string | null;
  onClose: () => void;
}

const FALLBACK_FORMAT: engine.MatchFormat = { periodCount: 2, periodMinutes: 25, overtimePeriodCount: 0, overtimeMinutes: 0 };

function toEnginePlayer(p: PlayerRow): engine.Player {
  return { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" };
}

/** "12:30" -> 750 segundos. Mesma validação de LiveMatch.tsx, em segundos em vez de ms. */
function parseMinSecToSeconds(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const SLOT_COLORS = ["#2a78d6", "#0ca30c", "#c98500", "#8b5cf6"];

const WEIGHT_OPTIONS = [1, 2, 3, 4, 5] as const;
const WEIGHT_LABELS: Record<number, string> = {
  1: "1 — pouca confiança",
  2: "2",
  3: "3 — normal",
  4: "4",
  5: "5 — muita confiança",
};

const GRID_STEP_MIN = 5;

/** Marcas de 5 em 5 minutos (sempre inclui o fim da parte, mesmo que não seja múltiplo de 5) — mesma escala proporcional (min/periodMinutes) usada na largura dos blocos, pra alinhar com eles. */
function gridMarks(periodMinutes: number): number[] {
  const marks = [];
  for (let m = 0; m <= periodMinutes; m += GRID_STEP_MIN) marks.push(m);
  if (marks[marks.length - 1] !== periodMinutes) marks.push(periodMinutes);
  return marks;
}

/** Régua de minutos acima das barras, de 5 em 5 — só os números, sem barra por turno. */
function MinuteRuler({ periodMinutes }: { periodMinutes: number }) {
  return (
    <div style={{ position: "relative", height: 16, marginBottom: 4, borderBottom: "1px solid var(--border, #ddd)" }}>
      {gridMarks(periodMinutes).map((min) => (
        <span
          key={min}
          style={{
            position: "absolute",
            left: `${(min / periodMinutes) * 100}%`,
            transform: min === 0 ? "none" : min === periodMinutes ? "translateX(-100%)" : "translateX(-50%)",
            fontSize: 9,
            color: "var(--ink-dim, #888)",
          }}
        >
          {min}
        </span>
      ))}
    </div>
  );
}

/** Linhas verticais de 5 em 5 minutos sobre a barra de turnos, pra dar noção de escala sem precisar escrever o horário de cada turno por extenso. */
function MinuteGridlines({ periodMinutes }: { periodMinutes: number }) {
  return (
    <>
      {gridMarks(periodMinutes)
        .filter((min) => min !== 0 && min !== periodMinutes)
        .map((min) => (
          <div
            key={min}
            style={{
              position: "absolute",
              left: `${(min / periodMinutes) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(255,255,255,.55)",
              pointerEvents: "none",
            }}
          />
        ))}
    </>
  );
}

interface AddForm {
  playerId: string;
  end: string;
}

/** "#10 Martim S — Ala Esquerda (A), Pivô (B)" — só leitura, pro treinador ver a classificação cadastrada (em Plantel) na hora de escolher quem entra em cada vaga. Sem vaga habitual cadastrada, mostra só o nome. */
function playerOptionLabel(
  p: engine.Player,
  aptitude: engine.AptitudeBySlot | undefined,
  availabilityStatus: AvailabilityStatus
): string {
  const base = `#${p.num} ${p.name}`;
  const slots = engine.sortedAptitudeSlots(aptitude ?? {});
  const withAptitude = slots.length > 0 ? `${base} — ${slots.map((slot) => engine.aptitudeLabel(slot, aptitude![slot])).join(", ")}` : base;
  // Símbolo simples na própria opção — <option> não suporta HTML rico (T013).
  if (availabilityStatus === "indisponivel") return `🚫 ${withAptitude}`;
  if (availabilityStatus === "a_retomar") return `⏳ ${withAptitude}`;
  return withAptitude;
}

export function RotationPlanner({ teamId, matchId, opponent, formatId, onClose }: Props) {
  const { players, status: playersStatus, refresh: refreshPlayers } = usePlayers(teamId);
  const { formats } = useMatchFormats(teamId);
  const { stints, status: planStatus, errorMessage, saveStints } = useRotationPlan(teamId, matchId);
  const aptitudes = usePlayerAptitudes(teamId);
  const recentMinutes = useRecentMinutes(teamId, matchId);
  const weights = useRotationWeights(teamId, matchId);

  const format: engine.MatchFormat =
    formats.find((f) => f.id === formatId) ?? formats.find((f) => f.isDefault) ?? formats[0] ?? FALLBACK_FORMAT;
  const durSec = format.periodMinutes * 60;

  const activeRoster = players.filter((p) => p.active).map(toEnginePlayer);
  const byId = (id: string) => activeRoster.find((p) => p.id === id);
  const availabilityByPlayer: Record<string, AvailabilityStatus> = {};
  players.forEach((p) => {
    availabilityByPlayer[p.id] = p.availabilityStatus;
  });

  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [localStints, setLocalStints] = useState<engine.RotationStint[]>([]);
  const [period, setPeriod] = useState(1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [addForms, setAddForms] = useState<Record<number, AddForm>>({});
  const [addErrors, setAddErrors] = useState<Record<number, string>>({});
  // Qual turno está "aberto" pra edição — em vez de uma linha de texto fixa por turno embaixo da
  // barra, só mostra os controles (editar fim / remover) do turno que o treinador clicou na barra.
  const [selectedStint, setSelectedStint] = useState<{ slotIndex: number; startSec: number } | null>(null);
  // Opções de plano geradas automaticamente, aguardando o treinador escolher uma — null = nenhuma gerada ainda.
  const [rotationOptions, setRotationOptions] = useState<engine.RotationPlanOption[] | null>(null);
  // Precisa de um segundo toque pra gerar por cima de um plano já existente (US4) — mesmo padrão de
  // confirmação "toca 2x" já usado no MatchEventEditor, nunca window.confirm() (falha silenciosa em PWA).
  const [confirmingGenerate, setConfirmingGenerate] = useState(false);
  const [generateError, setGenerateError] = useState("");
  // Confiança: guarda sozinha ao trocar o <select>, mas o onChange original não aguardava a escrita
  // nem tratava falha — uma rejeição silenciosa (rede instável, sessão expirada) deixava o valor
  // mostrado reverter no próximo render, sem nenhum aviso, e qualquer geração seguinte usava o peso
  // antigo. Guarda aqui o que falhou pra poder avisar e deixar tentar de novo.
  const [weightSaveError, setWeightSaveError] = useState<{ playerId: string; slot: engine.RotationSlotType; weight: number; message: string } | null>(null);

  // Carrega o plano já salvo (se houver) uma única vez, assim que a leitura
  // termina — depois disso, quem manda é a edição local até "Guardar".
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    if (planStatus !== "ready" || loadedOnce) return;
    setLocalStints(stints);
    setIncluded(new Set(stints.map((s) => s.playerId)));
    setLoadedOnce(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStatus, loadedOnce]);

  if (playersStatus === "loading" || planStatus === "loading") {
    return <p className="empty">A carregar...</p>;
  }

  function toggleIncluded(id: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function formFor(slotIndex: number): AddForm {
    return addForms[slotIndex] ?? { playerId: "", end: engine.fmtMinSec(durSec * 1000) };
  }

  function updateForm(slotIndex: number, patch: Partial<AddForm>) {
    setAddForms((prev) => ({ ...prev, [slotIndex]: { ...formFor(slotIndex), ...patch } }));
  }

  /** Onde o próximo turno desta vaga/parte começaria — sempre o fim do último já montado (0:00 se ainda não há nenhum). O treinador nunca escolhe o início: ele é sempre a saída de quem estava antes, pra nunca abrir buraco na vaga. */
  function nextStartForSlot(slotIndex: number): number {
    const slotStints = localStints.filter((s) => s.slotIndex === slotIndex && s.period === period);
    if (slotStints.length === 0) return 0;
    return Math.max(...slotStints.map((s) => s.endSec));
  }

  /** Mensagem de erro quando um atleta já está escalado noutra vaga nesse horário — um atleta só pode estar numa vaga de cada vez em quadra. */
  function conflictMessage(conflict: engine.RotationStint): string {
    const slotName = engine.ROTATION_SLOT_TYPES[conflict.slotIndex];
    return `Já está escalado em ${slotName} nesse horário (${engine.fmtMinSec(conflict.startSec * 1000)} a ${engine.fmtMinSec(conflict.endSec * 1000)}).`;
  }

  function handleAddStint(slotIndex: number) {
    const form = formFor(slotIndex);
    const startSec = nextStartForSlot(slotIndex);
    if (!form.playerId) {
      setAddErrors((prev) => ({ ...prev, [slotIndex]: "Escolha um atleta." }));
      return;
    }
    const endSec = parseMinSecToSeconds(form.end);
    if (endSec == null) {
      setAddErrors((prev) => ({ ...prev, [slotIndex]: "Horário inválido — use mm:ss." }));
      return;
    }
    if (endSec > durSec || startSec >= endSec) {
      setAddErrors((prev) => ({ ...prev, [slotIndex]: "Intervalo inválido para esta parte." }));
      return;
    }
    const conflict = engine.playerOverlapsOtherSlot(localStints, form.playerId, period, slotIndex, startSec, endSec);
    if (conflict) {
      setAddErrors((prev) => ({ ...prev, [slotIndex]: conflictMessage(conflict) }));
      return;
    }
    setAddErrors((prev) => ({ ...prev, [slotIndex]: "" }));
    setAddForms((prev) => ({ ...prev, [slotIndex]: { playerId: "", end: engine.fmtMinSec(durSec * 1000) } }));
    persistStints([...localStints, { playerId: form.playerId, slotIndex, period, startSec, endSec }]);
  }

  /** Só o último turno da vaga pode ser removido (o botão só aparece pra ele) — remover um do meio abriria um buraco sem ninguém na vaga. */
  function removeStint(stint: engine.RotationStint) {
    persistStints(localStints.filter((s) => s !== stint));
  }

  /** Troca o atleta de um turno já existente, mantendo o horário igual — é assim que se corrige/substitui alguém num plano já salvo, sem precisar desmontar a vaga inteira. */
  function changeStintPlayer(stint: engine.RotationStint, newPlayerId: string) {
    if (newPlayerId === stint.playerId) return;
    const conflict = engine.playerOverlapsOtherSlot(localStints, newPlayerId, stint.period, stint.slotIndex, stint.startSec, stint.endSec);
    if (conflict) {
      setAddErrors((prev) => ({ ...prev, [stint.slotIndex]: conflictMessage(conflict) }));
      return;
    }
    setAddErrors((prev) => ({ ...prev, [stint.slotIndex]: "" }));
    persistStints(localStints.map((s) => (s === stint ? { ...s, playerId: newPlayerId } : s)));
  }

  /** Edita o fim de um turno QUE JÁ TEM um próximo depois dele, empurrando o início desse próximo junto — nunca cria buraco nem sobreposição. Devolve false (e não aplica nada) se isso escalaria o atleta em duas vagas ao mesmo tempo. */
  function editStintEnd(stint: engine.RotationStint, newEndSec: number): boolean {
    const clamped = Math.max(stint.startSec + 1, Math.min(newEndSec, durSec));
    const conflict = engine.playerOverlapsOtherSlot(localStints, stint.playerId, stint.period, stint.slotIndex, stint.startSec, clamped);
    if (conflict) {
      setAddErrors((prev) => ({ ...prev, [stint.slotIndex]: conflictMessage(conflict) }));
      return false;
    }
    const next = engine.nextStintInSlot(localStints, stint.slotIndex, stint.period, stint.endSec);
    persistStints(
      localStints.map((s) => {
        if (s === stint) return { ...s, endSec: clamped };
        if (next && s === next) return { ...s, startSec: clamped };
        return s;
      })
    );
    return true;
  }

  /** Edita o fim do ÚLTIMO turno da vaga (sem ninguém depois pra empurrar) — só redimensiona ele mesmo. Mesma checagem de conflito de `editStintEnd`. */
  function editTerminalEnd(stint: engine.RotationStint, newEndSec: number): boolean {
    const clamped = Math.max(stint.startSec + 1, Math.min(newEndSec, durSec));
    const conflict = engine.playerOverlapsOtherSlot(localStints, stint.playerId, stint.period, stint.slotIndex, stint.startSec, clamped);
    if (conflict) {
      setAddErrors((prev) => ({ ...prev, [stint.slotIndex]: conflictMessage(conflict) }));
      return false;
    }
    persistStints(localStints.map((s) => (s === stint ? { ...s, endSec: clamped } : s)));
    return true;
  }

  /**
   * Toda alteração (adicionar, remover, editar fronteira) chama isto — guarda
   * sozinho, na hora, sem precisar de um botão de "Guardar plano" separado
   * depois de cada turno montado.
   */
  async function persistStints(next: engine.RotationStint[]) {
    setLocalStints(next);
    setSaveState("saving");
    try {
      await saveStints(next);
      setSaveState("saved");
      // "A retomar" pode ter revertido sozinho pra "apto" dentro de saveStints
      // (Decisão 1, specs/003-data-driven-rotation/research.md) — recarrega
      // pra refletir isso no seletor de atleta sem precisar fechar/reabrir.
      await refreshPlayers();
    } catch (err) {
      setSaveState("error");
      setSaveError(toErrorMessage(err));
    }
  }

  const periodStints = localStints.filter((s) => s.period === period);
  const totalByPlayer = engine.plannedSecondsByPlayer(localStints);
  const perPeriodByPlayer = engine.plannedSecondsByPlayerPerPeriod(localStints);
  const includedPlayersSorted = activeRoster
    .filter((p) => included.has(p.id))
    .sort((a, b) => (parseInt(a.num, 10) || 999) - (parseInt(b.num, 10) || 999));

  /** Peso salvo pra este jogo, ou o padrão sugerido (aptidão + estado) se o treinador ainda não ajustou (FR-003). */
  function effectiveWeight(playerId: string, slot: engine.RotationSlotType): number {
    const saved = weights.weightsByPlayerSlot[playerId]?.[slot];
    if (saved != null) return saved;
    return engine.defaultWeight(aptitudes.byPlayer[playerId]?.[slot] ?? null, availabilityByPlayer[playerId] ?? "apto");
  }

  async function handleWeightChange(playerId: string, slot: engine.RotationSlotType, weight: number) {
    setWeightSaveError(null);
    try {
      await weights.setWeight(playerId, slot, weight);
      // As opções já geradas (se houver) são uma foto de um momento — ficam desatualizadas assim que
      // a confiança muda, então força gerar de novo em vez de deixar o treinador escolher algo que já
      // não reflete o ajuste que ele acabou de fazer.
      setRotationOptions(null);
    } catch (err) {
      setWeightSaveError({ playerId, slot, weight, message: toErrorMessage(err) });
    }
  }

  /** Acionada pelo treinador (FR-001, nunca sozinha) — pede confirmação (toca 2x) se já existe um plano salvo (US4). */
  function handleGenerate() {
    setGenerateError("");
    if (localStints.length > 0 && !confirmingGenerate) {
      setConfirmingGenerate(true);
      return;
    }
    setConfirmingGenerate(false);
    if (includedPlayersSorted.length === 0) {
      setGenerateError("Inclua pelo menos um atleta no plano antes de gerar.");
      return;
    }
    const weightsBySlot: engine.PlayerSlotWeights = {};
    includedPlayersSorted.forEach((p) => {
      const bySlot: Partial<Record<engine.RotationSlotType, number>> = {};
      engine.ROTATION_SLOT_TYPES.forEach((slot) => {
        bySlot[slot] = effectiveWeight(p.id, slot);
      });
      weightsBySlot[p.id] = bySlot;
    });
    setRotationOptions(engine.generateRotationOptions(includedPlayersSorted, weightsBySlot, availabilityByPlayer, format));
  }

  async function chooseOption(option: engine.RotationPlanOption) {
    setRotationOptions(null);
    await persistStints(option.stints);
  }

  return (
    <div>
      <button type="button" className="btn sm ghost" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Voltar ao painel
      </button>
      <h2 style={{ fontSize: 18 }}>Planear rotações — vs {opponent}</h2>
      <p className="hint">
        Monte o plano à mão, turno a turno — não mexe no jogo ao vivo, só avisa durante o jogo quando o tempo
        previsto de alguém está acabando. As aptidões de cada atleta (vagas que sabe jogar) aparecem ao escolher
        quem entra em cada vaga abaixo — para editá-las, use o Plantel.
      </p>

      <h3 className="section-title" style={{ marginTop: 16 }}>Incluídos no plano</h3>
      <div className="pgrid">
        {activeRoster.map((p) => {
          const gr = isGoalkeeper(p.pos);
          return (
            <button
              key={p.id}
              type="button"
              className={`pchip${gr ? " gr" : ""}${included.has(p.id) ? " selected" : ""}`}
              disabled={gr}
              onClick={() => toggleIncluded(p.id)}
              title={gr ? "Guarda-redes fica fora da rotação — joga a parte inteira" : undefined}
            >
              <span className="nm">{p.name}</span>
              <span className="corner-bl">
                <span className="n">#{p.num}</span>
                <span className="pos">{posAbbr(p.pos)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {includedPlayersSorted.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 16 }}>Confiança por vaga, pra este jogo</h3>
          <p className="hint">
            Começa com a aptidão de cada atleta (ver Plantel) — ajuste aqui só vale pra este jogo, nunca muda o
            cadastro permanente. Quanto mais confiança, mais tempo o atleta recebe ao gerar.
          </p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Atleta</th>
                  {engine.ROTATION_SLOT_TYPES.map((slot) => (
                    <th key={slot}>{slot}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {includedPlayersSorted.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.num} {p.name}</td>
                    {engine.ROTATION_SLOT_TYPES.map((slot) => (
                      <td key={slot}>
                        <select
                          value={effectiveWeight(p.id, slot)}
                          onChange={(e) => handleWeightChange(p.id, slot, Number(e.currentTarget.value))}
                        >
                          {WEIGHT_OPTIONS.map((w) => (
                            <option key={w} value={w}>{WEIGHT_LABELS[w]}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {weightSaveError && (
            <p className="banner error" style={{ marginTop: 8 }}>
              Não consegui guardar a confiança — {weightSaveError.message}{" "}
              <button
                type="button"
                className="btn sm"
                onClick={() => handleWeightChange(weightSaveError.playerId, weightSaveError.slot, weightSaveError.weight)}
              >
                Tentar de novo
              </button>
            </p>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className={`btn${confirmingGenerate ? " danger" : " primary"}`} onClick={handleGenerate}>
              {confirmingGenerate ? "Confirmar — substitui o plano atual" : "Gerar opções de plano"}
            </button>
            {confirmingGenerate && (
              <button type="button" className="btn ghost" onClick={() => setConfirmingGenerate(false)}>Cancelar</button>
            )}
          </div>
          {generateError && <p className="banner error" style={{ marginTop: 8 }}>{generateError}</p>}

          {rotationOptions && (
            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Escolha uma opção</h3>
              <p className="hint">
                As 3 opções são 3 filosofias de rotação, não só turnos mais curtos: variam quanto tempo seguido um
                atleta pode segurar a mesma vaga antes de ser forçado a ceder, mesmo tendo mais confiança registada —
                de "Foco nos mais aptos" (o melhor joga a maior parte do tempo) a "Dá minutos a todos" (ninguém segura
                uma vaga por mais que 5 minutos seguidos).
              </p>
              <div className="pgrid">
                {rotationOptions.map((option) => (
                  <div key={option.label} className="card" style={{ padding: 10 }}>
                    <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>{option.label}</h4>
                    <ul className="hint" style={{ margin: "0 0 8px", paddingLeft: 16 }}>
                      {includedPlayersSorted.map((p) => (
                        <li key={p.id}>
                          #{p.num} {p.name}: {engine.fmtMinSec((option.totalSecondsByPlayer[p.id] ?? 0) * 1000)}
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="btn sm primary" onClick={() => chooseOption(option)}>
                      Escolher esta
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setRotationOptions(null)}>
                Cancelar
              </button>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            {Array.from({ length: format.periodCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`btn sm${p === period ? " primary" : " ghost"}`}
                onClick={() => {
                  setPeriod(p);
                  setSelectedStint(null);
                }}
              >
                {engine.periodLabel(p, format)}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <MinuteRuler periodMinutes={format.periodMinutes} />
            {engine.ROTATION_SLOT_TYPES.map((slotType, slotIndex) => {
              const slotStints = periodStints.filter((s) => s.slotIndex === slotIndex).sort((a, b) => a.startSec - b.startSec);
              const nextStart = slotStints.length > 0 ? slotStints[slotStints.length - 1].endSec : 0;
              const color = SLOT_COLORS[slotIndex];
              const form = formFor(slotIndex);
              const error = addErrors[slotIndex];
              // Ordem sugerida pra esta vaga — aptidão como fator principal, estado afasta
              // o indisponível pro fim, minutos recentes só compõem o motivo (specs/003-data-driven-rotation/).
              const suggestedOrder = engine.suggestOrder(
                includedPlayersSorted,
                aptitudes.byPlayer,
                availabilityByPlayer,
                recentMinutes.byPlayer,
                slotType
              );
              const suggestedOptions = suggestedOrder
                .map((s) => includedPlayersSorted.find((pl) => pl.id === s.playerId))
                .filter((pl): pl is engine.Player => pl != null);
              // Motivo por extenso da sugestão (US3) — mesma frase já computada em suggestOrder, só exibida.
              const reasonFor = (playerId: string) => suggestedOrder.find((s) => s.playerId === playerId)?.reason;
              return (
                <div key={slotIndex} style={{ marginBottom: 20 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>{slotType}</h4>

                  {slotStints.length === 0 ? (
                    <p className="hint">Ninguém atribuído a esta vaga ainda.</p>
                  ) : (
                    <>
                      <div
                        style={{
                          position: "relative",
                          display: "flex",
                          height: 28,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: "var(--surface-2)",
                          marginBottom: 6,
                        }}
                      >
                        {slotStints.map((s) => {
                          const p = byId(s.playerId);
                          const widthPct = ((s.endSec - s.startSec) / durSec) * 100;
                          const isSelected = selectedStint?.slotIndex === slotIndex && selectedStint.startSec === s.startSec;
                          return (
                            <div
                              key={s.playerId + s.startSec}
                              onClick={() => setSelectedStint(isSelected ? null : { slotIndex, startSec: s.startSec })}
                              style={{
                                width: `${widthPct}%`,
                                background: color,
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                padding: "0 2px",
                                cursor: "pointer",
                                boxShadow: isSelected ? "inset 0 0 0 2px #fff" : undefined,
                                borderRight: "1px solid rgba(255,255,255,.5)",
                              }}
                              title={`${p?.name ?? "?"} — ${engine.fmtMinSec(s.startSec * 1000)} a ${engine.fmtMinSec(s.endSec * 1000)} (clique pra editar)`}
                            >
                              {p?.name ?? "?"}
                            </div>
                          );
                        })}
                        <MinuteGridlines periodMinutes={format.periodMinutes} />
                      </div>

                      {(() => {
                        if (selectedStint?.slotIndex !== slotIndex) return null;
                        const i = slotStints.findIndex((s) => s.startSec === selectedStint.startSec);
                        if (i === -1) return null;
                        const s = slotStints[i];
                        const isLastByPosition = i === slotStints.length - 1;
                        const reachesEnd = s.endSec === durSec;
                        return (
                          <div className="hint" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                            <select value={s.playerId} onChange={(e) => changeStintPlayer(s, e.currentTarget.value)}>
                              {suggestedOptions.map((pl) => (
                                <option key={pl.id} value={pl.id}>
                                  {playerOptionLabel(pl, aptitudes.byPlayer[pl.id], availabilityByPlayer[pl.id] ?? "apto")}
                                </option>
                              ))}
                            </select>
                            <span>{engine.fmtMinSec(s.startSec * 1000)} até</span>
                            {reachesEnd ? (
                              <span>{engine.fmtMinSec(s.endSec * 1000)} (fim da parte)</span>
                            ) : (
                              <input
                                type="text"
                                defaultValue={engine.fmtMinSec(s.endSec * 1000)}
                                style={{ width: 56 }}
                                onBlur={(e) => {
                                  const sec = parseMinSecToSeconds(e.currentTarget.value);
                                  const applied = sec != null && (isLastByPosition ? editTerminalEnd : editStintEnd)(s, sec);
                                  if (!applied) e.currentTarget.value = engine.fmtMinSec(s.endSec * 1000);
                                }}
                              />
                            )}
                            {isLastByPosition && (
                              <button type="button" className="btn sm ghost" onClick={() => { removeStint(s); setSelectedStint(null); }} title="Só dá pra remover o último turno da vaga, pra nunca abrir buraco no meio.">
                                Remover
                              </button>
                            )}
                            <button type="button" className="btn sm ghost" onClick={() => setSelectedStint(null)}>Fechar</button>
                          </div>
                        );
                      })()}
                      {selectedStint?.slotIndex === slotIndex && (() => {
                        const i = slotStints.findIndex((s) => s.startSec === selectedStint.startSec);
                        const reason = i !== -1 ? reasonFor(slotStints[i].playerId) : null;
                        return reason ? <p className="hint" style={{ marginTop: 0 }}>{reason}</p> : null;
                      })()}
                    </>
                  )}

                  {nextStart >= durSec ? (
                    <p className="hint">✅ Vaga preenchida até o fim da parte.</p>
                  ) : (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      <span className="hint">A partir de {engine.fmtMinSec(nextStart * 1000)}:</span>
                      <select value={form.playerId} onChange={(e) => updateForm(slotIndex, { playerId: e.currentTarget.value })}>
                        <option value="">Escolher atleta...</option>
                        {suggestedOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {playerOptionLabel(p, aptitudes.byPlayer[p.id], availabilityByPlayer[p.id] ?? "apto")}
                          </option>
                        ))}
                      </select>
                      <span>até</span>
                      <input
                        type="text"
                        style={{ width: 56 }}
                        value={form.end}
                        onInput={(e) => updateForm(slotIndex, { end: e.currentTarget.value })}
                      />
                      <button type="button" className="btn sm" onClick={() => handleAddStint(slotIndex)}>+ Adicionar turno</button>
                    </div>
                  )}
                  {form.playerId && reasonFor(form.playerId) && (
                    <p className="hint" style={{ marginTop: 2 }}>{reasonFor(form.playerId)}</p>
                  )}
                  {error && <p className="hint" style={{ color: "#c0392b" }}>{error}</p>}
                </div>
              );
            })}
          </div>

          <h3 className="section-title" style={{ marginTop: 16 }}>Minutos previstos</h3>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Atleta</th>
                  {Array.from({ length: format.periodCount }, (_, i) => i + 1).map((p) => (
                    <th key={p} className="num">{engine.periodLabel(p, format).replace(" Parte", "")}</th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {includedPlayersSorted.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.num} {p.name}</td>
                    {Array.from({ length: format.periodCount }, (_, i) => i + 1).map((per) => (
                      <td key={per} className="num">{engine.fmtMinSec((perPeriodByPlayer[p.id]?.[per] ?? 0) * 1000)}</td>
                    ))}
                    <td className="num">{engine.fmtMinSec((totalByPlayer[p.id] ?? 0) * 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginTop: 16 }}>
            {saveState === "saving" && "A guardar..."}
            {saveState === "saved" && "✅ Guardado — cada turno adicionado, editado ou removido é salvo na hora."}
            {saveState === "idle" && "Cada turno adicionado, editado ou removido é salvo na hora, sem precisar de um botão separado."}
          </p>
          {saveState === "error" && (
            <p className="banner error">
              Não consegui guardar — {saveError}{" "}
              <button type="button" className="btn sm" onClick={() => persistStints(localStints)}>Tentar de novo</button>
            </p>
          )}
        </>
      )}
      {planStatus === "error" && <p className="banner error">Não consegui carregar o plano — {errorMessage}</p>}
    </div>
  );
}
