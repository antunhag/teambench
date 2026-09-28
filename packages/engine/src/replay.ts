// Reconstrói um LiveMatchState inteiro a partir só da lista de eventos já
// sincronizada — para abrir um jogo já começado num aparelho que nunca teve
// o progresso local dele (ex.: telemóvel que registou o jogo, tablet
// diferente tentando continuar/corrigir depois). Sem isto, useLiveMatch
// começaria sempre do zero (mesmo com dezenas de eventos já no Supabase),
// e chegaria a mostrar de novo a tela de escolher o cinco inicial — que não
// faz sentido nenhum para um jogo que já aconteceu.
//
// Cada evento é aplicado usando o próprio `ms`/`period` gravado nele, nunca
// o relógio de parede — por isso os efeitos aqui são sempre aplicados
// incondicionalmente (nunca com o guard "só se state.clock.running", que só
// faz sentido durante o jogo ao vivo de verdade). Isto tem um efeito colateral
// bom: se uma parte foi corrigida depois via MatchEventEditor (ex.: o bug do
// botão "Iniciar Parte 2" que deixava tudo em ms=0), o replay já contabiliza
// o tempo em quadra certo a partir dos tempos corrigidos — não precisa de
// nenhuma lógica extra para isso.
import { markOnSince, settleAll, settlePlayer } from "./clock";
import { isLastPeriod } from "./matchFormat";
import { createLiveMatchState, foulsInPeriod, titularIdsFromEvents } from "./liveMatch";
import type { LiveMatchState } from "./liveMatch";
import { recomputeScoreFor } from "./events";
import type { MatchEvent, MatchFormat } from "./types";

function sortEvents(events: MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => (a.period - b.period) || (a.ms - b.ms) || (a.ts - b.ts));
}

export function replayEvents(convocadoIds: string[], events: MatchEvent[], format: MatchFormat): LiveMatchState {
  let s = createLiveMatchState(convocadoIds);
  if (events.length === 0) return s;

  const sorted = sortEvents(events);
  let clockAcc = s.clockAcc;
  let onCourt = s.onCourt;
  let titularIds = s.titularIds;
  let period = 1;
  let started = false;
  let finished = false;
  let activePause: LiveMatchState["activePause"] = null;
  let treatment: LiveMatchState["treatment"] = null;
  // Só serve para mostrar um relógio parado num valor informativo enquanto
  // aguarda o próximo apito (ver fim do laço) — nunca reanima o relógio de
  // parede sozinho: mesmo que a parte já tenha "kickoff" sem "fim_periodo"
  // (aparelho fechou a meio, ex.), reabrir aqui sempre pousa em
  // "aguardando apito" (clock.running=false) em vez de arriscar um relógio
  // retomado com uma base de tempo real errada.
  let lastMsInPeriod = 0;

  for (const ev of sorted) {
    const atMs = ev.ms;
    lastMsInPeriod = ev.type === "fim_periodo" ? 0 : atMs;
    switch (ev.type) {
      case "kickoff": {
        onCourt = ev.lineup ?? onCourt;
        onCourt.forEach((id) => {
          clockAcc = markOnSince(clockAcc, id, atMs);
        });
        if (!started) titularIds = onCourt.slice();
        started = true;
        period = ev.period;
        break;
      }
      case "cartao_vermelho": {
        if (ev.playerId && onCourt.includes(ev.playerId)) {
          clockAcc = settlePlayer(clockAcc, ev.playerId, atMs);
          onCourt = onCourt.filter((id) => id !== ev.playerId);
        }
        break;
      }
      case "substituicao": {
        if (ev.outId) clockAcc = settlePlayer(clockAcc, ev.outId, atMs);
        if (ev.playerId) clockAcc = markOnSince(clockAcc, ev.playerId, atMs);
        // Sai ANTES de entrar: numa substituição normal (5 em quadra) o "onCourt.length < 5"
        // só é verdade depois de abrir a vaga de quem saiu. Testar antes disso barrava
        // silenciosamente quem entrava sempre que o quadro já estivesse cheio — o efeito
        // no clockAcc (linhas acima) já tinha acontecido certo, mas esse atleta nunca mais
        // aparecia no array `onCourt`, então nem era assentado pelo settleAll no fim da
        // parte: o tempo dele desde essa substituição até o apito final sumia da contagem.
        if (ev.outId) onCourt = onCourt.filter((id) => id !== ev.outId);
        if (ev.playerId && !onCourt.includes(ev.playerId) && onCourt.length < 5) onCourt = [...onCourt, ev.playerId];
        break;
      }
      case "pausa": {
        activePause = { startedAtMs: atMs, label: ev.label ?? "", reasonId: ev.reasonId };
        break;
      }
      case "fim_pausa": {
        if (activePause) {
          const durMs = Math.max(0, atMs - activePause.startedAtMs);
          onCourt.forEach((id) => {
            if (clockAcc.onCourtSince[id] != null) {
              clockAcc = { ...clockAcc, onCourtSince: { ...clockAcc.onCourtSince, [id]: clockAcc.onCourtSince[id] + durMs } };
            }
          });
          activePause = null;
        }
        break;
      }
      case "lesao_inicio": {
        if (ev.playerId) treatment = { playerId: ev.playerId, startedAtMs: atMs };
        break;
      }
      case "lesao_fim": {
        treatment = null;
        break;
      }
      case "fim_periodo": {
        if (activePause) {
          const durMs = Math.max(0, atMs - activePause.startedAtMs);
          onCourt.forEach((id) => {
            if (clockAcc.onCourtSince[id] != null) {
              clockAcc = { ...clockAcc, onCourtSince: { ...clockAcc.onCourtSince, [id]: clockAcc.onCourtSince[id] + durMs } };
            }
          });
          activePause = null;
        }
        clockAcc = settleAll(clockAcc, onCourt, atMs);
        finished = isLastPeriod(ev.period, format);
        period = finished ? ev.period : ev.period + 1;
        break;
      }
      // golo/golo_sofrido/cartao_amarelo/falta/falta_sofrida: não mudam
      // onCourt/clockAcc — placar e faltas são recalculados no fim, direto
      // da lista de eventos (ver recomputeScoreFor/foulsInPeriod).
      default:
        break;
    }
  }

  const currentPeriodFouls = foulsInPeriod(sorted, period);
  s = {
    ...s,
    convocadoIds,
    onCourt,
    titularIds: titularIds.length ? titularIds : titularIdsFromEvents(sorted),
    period,
    events: sorted,
    score: recomputeScoreFor(sorted),
    treatment,
    activePause,
    periodFouls: currentPeriodFouls.nos,
    periodFoulsAdvers: currentPeriodFouls.advers,
    clockAcc,
    started,
    finished,
    // Sempre parado ao reabrir por replay — ver comentário de lastMsInPeriod
    // acima. Quem quiser continuar de verdade usa "Iniciar Parte N" ou
    // "Registar com vídeo" normalmente, criando um novo apito explícito.
    clock: { running: false, elapsedMs: finished ? 0 : lastMsInPeriod, startTs: null },
  };
  return s;
}
