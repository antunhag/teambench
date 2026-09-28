import {
  describeEvents,
  isLastPeriod,
  TIPOS_GOLO_BOLA_PARADA,
  TIPOS_GOLO_ESPECIAL,
  TIPOS_GOLO_JOGO_ABERTO,
  timeoutUsedInPeriod,
  TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM,
  TRANSICAO_NUMEROS_VANTAGEM,
  ZONAS_GOLO,
} from "@teambench/engine";
import { useEffect, useState } from "preact/hooks";
import type { PlayerRow } from "../team/usePlayers";
import { isGoalkeeper, posAbbr } from "../team/positions";
import { PlayerChip, Sheet } from "./PickerUI";
import type { useLiveMatch } from "./useLiveMatch";

interface Props {
  live: ReturnType<typeof useLiveMatch>;
  roster: PlayerRow[];
  opponent: string | null;
  onViewSummary: () => void;
  /** Nome/sigla do clube (ex.: "AAL") — o app serve vários clubes, nunca fixo como "Nós". */
  ourLabel: string;
}

function fmtMinSec(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

/** Aceita "mm:ss" (segundos 0-59) — usado só pelo campo de tempo do modo manual. */
function parseMinSec(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000;
}

type Picker =
  | { kind: "player"; playerId: string } // toca num jogador EM CAMPO -> ações contextuais (cartão/falta/substituir/atendimento)
  | { kind: "sub-out" } // atalho da barra: escolher primeiro quem sai
  | { kind: "sub-in"; outId: string } // escolher quem entra, já sabendo quem sai
  | { kind: "sub-out-for-entry"; inId: string } // banco cheio: escolher quem sai para este entrar
  | null;

/**
 * Um golo (nosso ou sofrido) é uma tela única (ver <GoloSheet/> mais abaixo)
 * em vez da sequência de telas separadas de antes (marcador → assistência →
 * tipo → zona) — cada toque escolhia uma coisa e trocava de tela, o que
 * custava tempo/foco de mais num jogo que não para. "Transição" continua
 * abrindo um passo extra (o detalhe de superioridade numérica não cabe como
 * mais uma fileira de chips sem poluir a tela principal).
 */
interface GoloFormState {
  side: "nos" | "adv";
  scorerId: string | null;
  assistId: string | null;
  tipo: string | null;
  zona: number | null;
  transicaoNumeros: string | null;
  balizaDeserta: boolean;
}

export function LiveMatch({ live, roster, opponent, onViewSummary, ourLabel }: Props) {
  const { state, elapsedMs } = live;
  const isFinalPeriod = isLastPeriod(state.period, live.format);
  const byId = new Map(roster.map((p) => [p.id, p]));
  const onCourt = state.onCourt.map((id) => byId.get(id)).filter((p): p is PlayerRow => !!p);
  const bench = state.convocadoIds
    .filter((id) => !state.onCourt.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is PlayerRow => !!p);

  const [showPauseReasons, setShowPauseReasons] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [goloForm, setGoloForm] = useState<GoloFormState | null>(null);
  const [showTransicaoModal, setShowTransicaoModal] = useState(false);

  function updateGoloForm(patch: Partial<GoloFormState>) {
    setGoloForm((f) => (f ? { ...f, ...patch } : f));
  }

  function selectTipo(t: string) {
    if (!goloForm) return;
    if (goloForm.tipo === t) {
      // Já selecionado: em Transição reabre o modal pra editar o detalhe; nos demais, desmarca.
      if (t === "trs") setShowTransicaoModal(true);
      else updateGoloForm({ tipo: null });
      return;
    }
    updateGoloForm({ tipo: t, transicaoNumeros: null, balizaDeserta: false });
    if (t === "trs") setShowTransicaoModal(true);
  }

  function selectScorer(id: string) {
    if (!goloForm) return;
    const deselecting = goloForm.scorerId === id;
    updateGoloForm({
      scorerId: deselecting ? null : id,
      // Ninguém dá assistência a si mesmo — trocar o marcador pro mesmo atleta da assistência a limpa.
      assistId: !deselecting && goloForm.assistId === id ? null : goloForm.assistId,
    });
  }

  function selectAssist(id: string | null) {
    if (!goloForm) return;
    updateGoloForm({ assistId: goloForm.assistId === id ? null : id });
  }

  function selectZona(z: number) {
    if (!goloForm) return;
    updateGoloForm({ zona: goloForm.zona === z ? null : z });
  }

  function confirmGolo() {
    if (!goloForm) return;
    if (goloForm.side === "nos") {
      if (!goloForm.scorerId) return;
      live.doGoal(goloForm.scorerId, goloForm.assistId, goloForm.tipo, goloForm.zona, goloForm.transicaoNumeros, goloForm.balizaDeserta);
    } else {
      live.doOppGoal(goloForm.tipo, goloForm.zona, goloForm.transicaoNumeros, goloForm.balizaDeserta);
    }
    setGoloForm(null);
  }
  // Campo de texto do modo manual — separado de live.manualElapsedMs pra
  // deixar digitar livremente ("1", "1:", "1:2"...) sem forçar formato a
  // cada tecla; só aplica (parseMinSec) ao sair do campo ou apertar Enter.
  const [manualInput, setManualInput] = useState(() => fmtMinSec(live.manualElapsedMs));
  useEffect(() => {
    setManualInput(fmtMinSec(live.manualElapsedMs));
  }, [live.manualElapsedMs]);
  function applyManualInput() {
    const ms = parseMinSec(manualInput);
    if (ms != null) live.setManualElapsedMs(ms);
    else setManualInput(fmtMinSec(live.manualElapsedMs));
  }

  const PAUSE_REASONS = [
    { id: "tempo_nos", label: `Pedido de Tempo — ${ourLabel}` },
    { id: "tempo_advers", label: "Pedido de Tempo — Adversário" },
    { id: "outro", label: "Outro motivo (lesão, árbitro, etc.)" },
  ];

  // Antes do primeiro "Iniciar Parte 1", o cinco inicial ainda pode estar
  // incompleto (ver PreMatch) — tocar num jogador aqui só ajusta quem fica
  // em campo (toggleTitular, sem gerar evento), em vez de contar como
  // substituição/ação de jogo. Isto é o que permite adiar a decisão do
  // cinco inicial até o apito real, sem travar o treinador na tela anterior.
  const preKickoff = !state.started;
  // O relógio fica parado (clock.running=false) tanto antes do 1º apito
  // quanto no intervalo entre partes (ver endPeriod) — em ambos os casos
  // precisa reaparecer o botão "Iniciar Parte N". `preKickoff` continua
  // separado porque só antes da parte 1 é que toques nos jogadores devem
  // ajustar livremente o cinco inicial (toggleTitular) em vez de contar
  // como substituição de verdade.
  const awaitingKickoff = !state.clock.running && !state.finished;

  // Pedido de tempo: 1 por equipa por parte (regra do futsal) — reconstruído
  // dos eventos, reseta sozinho a cada parte nova. "Outro motivo" (lesão,
  // árbitro) nunca conta como pedido de tempo, então não tem limite.
  const timeoutNosUsed = timeoutUsedInPeriod(state.events, state.period, "tempo_nos");
  const timeoutAdversUsed = timeoutUsedInPeriod(state.events, state.period, "tempo_advers");

  // O relógio da parte NUNCA para durante uma pausa (ver liveMatch.ts) — o
  // risco de esquecer de retomar um relógio parado é maior do que o
  // benefício de o parar de verdade. `elapsedMs` já atualiza a cada segundo
  // (o tick de useLiveMatch roda sempre que o relógio está "running", e ele
  // fica running o tempo todo depois do apito), então o cronómetro da pausa
  // é só a diferença — sem precisar de nenhum timer à parte.
  const pauseElapsedMs = state.activePause ? elapsedMs - state.activePause.startedAtMs : 0;

  function handleBenchTap(p: PlayerRow) {
    if (preKickoff) {
      live.toggleTitular(p.id);
    } else if (state.onCourt.length < 5) {
      live.doEnter(p.id);
    } else {
      setPicker({ kind: "sub-out-for-entry", inId: p.id });
    }
  }

  function handleOnCourtTap(p: PlayerRow) {
    if (preKickoff) live.toggleTitular(p.id);
    else setPicker({ kind: "player", playerId: p.id });
  }

  return (
    <div>
      <div className="scoreboard" style={{ flexDirection: "column" }}>
        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="score-side">
            <div className="lbl">{ourLabel}</div>
            <div className="val">{state.score.nos}</div>
          </div>
          <div className="clock-mid">
            <div className="lbl" style={{ fontSize: 10.5, opacity: 0.85 }}>
              Parte {state.period}
              {live.manual && state.started ? " 🎬" : ""}
            </div>
            <div className="time">{fmtMinSec(elapsedMs)}</div>
            {awaitingKickoff && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                <button type="button" className="clock-btn" onClick={() => live.resumeOrStart()}>
                  Iniciar Parte {state.period}
                </button>
                <button type="button" className="btn sm ghost" onClick={() => live.manualResumeOrStart()}>
                  🎬 Registar com vídeo
                </button>
              </div>
            )}
          </div>
          <div className="score-side">
            <div className="lbl">{opponent || "Advers."}</div>
            <div className="val">{state.score.advers}</div>
          </div>
        </div>
        <div className="scoreboard-timeouts" style={{ width: "100%" }}>
          <div className="timeout-box">
            <span className="lbl">Timeout</span>
            <span className="box">{timeoutNosUsed ? 1 : 0}</span>
          </div>
          <div className="timeout-box">
            <span className="lbl">Timeout</span>
            <span className="box">{timeoutAdversUsed ? 1 : 0}</span>
          </div>
        </div>
        <div className="scoreboard-fouls">
          <div className={`foul${state.periodFouls >= 5 ? " warn" : ""}`}>
            Faltas {ourLabel}
            <span className="n">{state.periodFouls}</span>
          </div>
          <div className={`foul${state.periodFoulsAdvers >= 5 ? " warn" : ""}`}>
            Faltas advers.
            <span className="n">{state.periodFoulsAdvers}</span>
          </div>
        </div>
      </div>

      {!awaitingKickoff && !state.finished && (
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              setGoloForm({ side: "adv", scorerId: null, assistId: null, tipo: null, zona: null, transicaoNumeros: null, balizaDeserta: false })
            }
          >
            🥅 +1 golo advers.
          </button>
        </div>
      )}

      {live.manual && !awaitingKickoff && !state.finished && (
        <div className="card" style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span className="hint" style={{ margin: 0 }}>🎬 Tempo de jogo:</span>
          <button type="button" className="btn sm ghost" onClick={() => live.setManualElapsedMs(live.manualElapsedMs - 10000)}>
            -10s
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={manualInput}
            onChange={(e) => setManualInput((e.target as HTMLInputElement).value)}
            onBlur={applyManualInput}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            style={{ width: 64, textAlign: "center" }}
          />
          <button type="button" className="btn sm ghost" onClick={() => live.setManualElapsedMs(live.manualElapsedMs + 10000)}>
            +10s
          </button>
        </div>
      )}

      {showPauseReasons && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>Motivo da pausa:</p>
          {PAUSE_REASONS.map((r) => {
            const alreadyUsed = (r.id === "tempo_nos" && timeoutNosUsed) || (r.id === "tempo_advers" && timeoutAdversUsed);
            return (
              <button
                key={r.id}
                type="button"
                className="btn ghost block"
                disabled={alreadyUsed}
                onClick={() => {
                  live.pause(r.label, r.id);
                  setShowPauseReasons(false);
                }}
                style={{ marginBottom: 4, textAlign: "left" }}
              >
                {r.label}
                {alreadyUsed ? " (já usado nesta parte)" : ""}
              </button>
            );
          })}
          <button type="button" className="btn ghost block" onClick={() => setShowPauseReasons(false)} style={{ marginTop: 4 }}>
            Cancelar
          </button>
        </div>
      )}

      {state.activePause && (
        <div className="banner warn" style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          ⏱️ {state.activePause.label}
          <strong className="num">{fmtMinSec(pauseElapsedMs)}</strong>
        </div>
      )}

      {state.finished && (
        <div className="banner success" style={{ textAlign: "center", marginTop: 12 }}>
          <strong>Jogo terminado</strong> — {ourLabel} {state.score.nos} – {state.score.advers} {opponent}
          <div style={{ marginTop: 6 }}>
            <button type="button" className="btn primary" onClick={onViewSummary}>
              📋 Ver Resumo
            </button>
          </div>
        </div>
      )}

      {state.treatment && (
        <div className="banner error" style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          🩹 Atendimento em curso: <strong>{byId.get(state.treatment.playerId)?.name}</strong>
          <button type="button" className="btn sm ghost" onClick={live.endTreatment}>Terminar</button>
        </div>
      )}

      {awaitingKickoff ? (
        <p className="hint">
          {preKickoff
            ? `Ainda ajustando o cinco inicial (${state.onCourt.length}/5) — toca nos jogadores pra adicionar/remover. Toca em "Iniciar Parte ${state.period}" quando o jogo começar de verdade.`
            : `Ajuste as substituições se precisar e toca em "Iniciar Parte ${state.period}" para recomeçar o relógio.`}{" "}
          Se for reconstruir esta parte depois (vendo o vídeo, ou por não ter conseguido registar ao vivo), usa
          "🎬 Registar com vídeo" — dá pra controlar o tempo à mão em vez do relógio real.
        </p>
      ) : (
        !state.finished && (
          <>
            <div className="tray" style={{ position: "static", background: "transparent", borderTop: "none", padding: 0, marginTop: 12 }}>
              <button type="button" className="btn" disabled={!live.canUndo} onClick={live.undo}>
                ↩️ Desfazer
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  setGoloForm({ side: "nos", scorerId: null, assistId: null, tipo: null, zona: null, transicaoNumeros: null, balizaDeserta: false })
                }
              >
                ⚽ Golo
              </button>
              {state.activePause ? (
                <button type="button" className="btn" onClick={live.endPause}>
                  ▶️ Retomar
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => setShowPauseReasons(true)}>
                  ⏱️ Pausa
                </button>
              )}
              <button type="button" className="btn" onClick={() => setPicker({ kind: "sub-out" })} disabled={bench.length === 0}>
                🔁 Substituição
              </button>
            </div>

            <p className="hint">
              Toca direto no atleta do banco pra entrar, ou num atleta em campo para cartão/falta/atendimento/substituição.
            </p>
          </>
        )
      )}

      <h3 className="section-title" style={{ marginTop: 16 }}>Em quadra ({onCourt.length})</h3>
      <div className="pgrid">
        {onCourt.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pchip${isGoalkeeper(p.position) ? " gr" : ""}${preKickoff ? " selected" : ""}`}
            disabled={state.finished}
            onClick={() => handleOnCourtTap(p)}
          >
            <span className="min">{Math.floor(live.playerSeconds(p.id) / 60)}'</span>
            <span className="n">#{p.num}</span>
            <span className="nm">{p.name}</span>
            <span className="pos">{posAbbr(p.position)}</span>
          </button>
        ))}
      </div>

      <h3 className="section-title" style={{ marginTop: 16 }}>Banco ({bench.length})</h3>
      <p className="hint" style={{ marginTop: 0 }}>Toca para entrar em quadra.</p>
      <div className="pgrid">
        {bench.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pchip dim${isGoalkeeper(p.position) ? " gr" : ""}`}
            disabled={state.finished}
            onClick={() => handleBenchTap(p)}
          >
            <span className="min">{Math.floor(live.playerSeconds(p.id) / 60)}'</span>
            <span className="n">#{p.num}</span>
            <span className="nm">{p.name}</span>
          </button>
        ))}
      </div>

      {!state.finished && !awaitingKickoff && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className={`btn block${isFinalPeriod ? " primary" : ""}`} onClick={live.endPeriod}>
            {isFinalPeriod ? "Terminar Jogo" : `Terminar Parte ${state.period}`}
          </button>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3 className="section-title">Registo ({state.events.length})</h3>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {(() => {
            const lookup = (id: string) => {
              const p = byId.get(id);
              return p ? { id: p.id, num: p.num ?? "", name: p.name, pos: p.position ?? "Universal" } : undefined;
            };
            // Recalculado do zero a cada render (ver describeEvents) — nunca
            // confia no "em quadra" gravado no golo, que fica desatualizado
            // se uma substituição for corrigida/inserida depois com um tempo
            // anterior ao golo (ver "Corrigir registo").
            const descriptions = describeEvents(state.events, lookup, live.format);
            return state.events
              .slice()
              .reverse()
              .map((e) => (
                <div key={e.id} className="logline">
                  <span className="d">{descriptions.get(e.id)}</span>
                </div>
              ));
          })()}
        </div>
      </div>

      {/* ---- Sheets de toque ---- */}

      {goloForm && (
        <Sheet
          title={goloForm.side === "nos" ? "Registar golo" : `Golo — ${opponent || "adversário"}`}
          onClose={() => setGoloForm(null)}
        >
          {goloForm.side === "nos" && (
            <>
              <p className="sub" style={{ marginTop: 0 }}>Quem marcou?</p>
              <div className="pgrid">
                {onCourt.map((p) => (
                  <PlayerChip
                    key={p.id}
                    p={p}
                    dim={goloForm.scorerId !== null && goloForm.scorerId !== p.id}
                    onClick={() => selectScorer(p.id)}
                  />
                ))}
              </div>
            </>
          )}

          <p className="sub">Tipo de jogada? — ⚽ Jogo aberto</p>
          <div className="actiongrid">
            {TIPOS_GOLO_JOGO_ABERTO.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`abtn${goloForm.tipo === t.id ? " selected" : ""}`}
                onClick={() => selectTipo(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="sub">🎯 Bola parada</p>
          <div className="actiongrid">
            {TIPOS_GOLO_BOLA_PARADA.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`abtn${goloForm.tipo === t.id ? " selected" : ""}`}
                onClick={() => selectTipo(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="sub">⚠️ Penalidades e situações especiais</p>
          <div className="actiongrid">
            {TIPOS_GOLO_ESPECIAL.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`abtn${goloForm.tipo === t.id ? " selected" : ""}`}
                onClick={() => selectTipo(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {goloForm.side === "nos" && (
            <>
              <p className="sub">Assistência?</p>
              <div className="pgrid">
                {onCourt
                  .filter((p) => p.id !== goloForm.scorerId)
                  .map((p) => (
                    <PlayerChip
                      key={p.id}
                      p={p}
                      dim={goloForm.assistId !== null && goloForm.assistId !== p.id}
                      onClick={() => selectAssist(p.id)}
                    />
                  ))}
              </div>
              <button
                type="button"
                className={`btn block${goloForm.assistId === null ? " primary" : " ghost"}`}
                onClick={() => selectAssist(null)}
                style={{ marginTop: 6 }}
              >
                Sem assistência
              </button>
            </>
          )}

          <p className="sub">Zona do golo?</p>
          <div className="zonegrid">
            {ZONAS_GOLO.map((z) => (
              <button
                key={z}
                type="button"
                className={`zbtn${goloForm.zona === z ? " selected" : ""}`}
                onClick={() => selectZona(z)}
              >
                {z}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn primary block"
            disabled={goloForm.side === "nos" && !goloForm.scorerId}
            onClick={confirmGolo}
            style={{ marginTop: 14 }}
          >
            {goloForm.side === "nos" ? "Confirmar golo" : "Confirmar golo sofrido"}
          </button>
        </Sheet>
      )}

      {goloForm && showTransicaoModal && (
        <Sheet title="Tipo de transição?" onClose={() => setShowTransicaoModal(false)}>
          <p className="sub" style={{ marginTop: 0 }}>Superioridade numérica</p>
          <div className="actiongrid">
            {TRANSICAO_NUMEROS_VANTAGEM.map((n) => (
              <button
                key={n}
                type="button"
                className={`abtn${goloForm.transicaoNumeros === n ? " selected" : ""}`}
                onClick={() => updateGoloForm({ transicaoNumeros: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="sub">Igualdade / outras</p>
          <div className="actiongrid">
            {TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM.map((n) => (
              <button
                key={n}
                type="button"
                className={`abtn${goloForm.transicaoNumeros === n ? " selected" : ""}`}
                onClick={() => updateGoloForm({ transicaoNumeros: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="sub">Modificadores rápidos</p>
          <button
            type="button"
            className={`checkbox-chip${goloForm.balizaDeserta ? " checked" : ""}`}
            onClick={() => updateGoloForm({ balizaDeserta: !goloForm.balizaDeserta })}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 8px 8px 26px" }}
          >
            🥅 Baliza deserta (goleiro-linha)
          </button>
          <button type="button" className="btn primary block" onClick={() => setShowTransicaoModal(false)} style={{ marginTop: 12 }}>
            Confirmar
          </button>
        </Sheet>
      )}

      {/* Aberto só a partir de um chip EM CAMPO — o banco entra direto (handleBenchTap), sem passar por aqui. */}
      {picker?.kind === "player" &&
        (() => {
          const p = byId.get(picker.playerId);
          if (!p) return null;
          const inTreatment = state.treatment?.playerId === p.id;
          return (
            <Sheet title={`#${p.num} ${p.name}`} sub="Em quadra" onClose={() => setPicker(null)}>
              <div className="actiongrid">
                <button
                  type="button"
                  className="abtn yellow"
                  onClick={() => {
                    live.doCard(p.id, "amarelo");
                    setPicker(null);
                  }}
                >
                  <span className="ic">🟨</span>Amarelo
                </button>
                <button
                  type="button"
                  className="abtn red"
                  onClick={() => {
                    live.doCard(p.id, "vermelho");
                    setPicker(null);
                  }}
                >
                  <span className="ic">🟥</span>Vermelho
                </button>
                <button
                  type="button"
                  className="abtn"
                  onClick={() => {
                    live.doFoul(p.id);
                    setPicker(null);
                  }}
                >
                  <span className="ic">✋</span>Falta cometida
                </button>
                <button
                  type="button"
                  className="abtn"
                  onClick={() => {
                    live.doFoulSuffered(p.id);
                    setPicker(null);
                  }}
                >
                  <span className="ic">🙌</span>Falta sofrida
                </button>
                <button type="button" className="abtn" onClick={() => setPicker({ kind: "sub-in", outId: p.id })}>
                  <span className="ic">🔁</span>Substituir (sai)
                </button>
                {!inTreatment ? (
                  <button
                    type="button"
                    className="abtn stop"
                    style={{ gridColumn: "1 / -1" }}
                    onClick={() => {
                      live.startTreatment(p.id);
                      setPicker(null);
                    }}
                  >
                    <span className="ic">🩹</span>Iniciar atendimento
                  </button>
                ) : (
                  <button
                    type="button"
                    className="abtn stop"
                    style={{ gridColumn: "1 / -1" }}
                    onClick={() => {
                      live.endTreatment();
                      setPicker(null);
                    }}
                  >
                    <span className="ic">✅</span>Terminar atendimento
                  </button>
                )}
              </div>
            </Sheet>
          );
        })()}

      {picker?.kind === "sub-out" && (
        <Sheet title="Quem sai?" sub="Atalho rápido — toca em quem vai sair" onClose={() => setPicker(null)}>
          <div className="pgrid">
            {onCourt.map((p) => (
              <PlayerChip key={p.id} p={p} onClick={() => setPicker({ kind: "sub-in", outId: p.id })} />
            ))}
          </div>
        </Sheet>
      )}

      {picker?.kind === "sub-in" && (
        <Sheet title="Quem entra?" sub={`Sai #${byId.get(picker.outId)?.num} ${byId.get(picker.outId)?.name}`} onClose={() => setPicker(null)}>
          <div className="pgrid">
            {bench.map((p) => (
              <PlayerChip
                key={p.id}
                p={p}
                onClick={() => {
                  live.doSub(picker.outId, p.id);
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}

      {picker?.kind === "sub-out-for-entry" && (
        <Sheet title="Quadra completa (5) — quem sai?" sub={`Para entrar #${byId.get(picker.inId)?.num} ${byId.get(picker.inId)?.name}`} onClose={() => setPicker(null)}>
          <div className="pgrid">
            {onCourt.map((p) => (
              <PlayerChip
                key={p.id}
                p={p}
                onClick={() => {
                  live.doSub(p.id, picker.inId);
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
