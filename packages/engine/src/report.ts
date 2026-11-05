// Descrição em texto do registo cronológico e exportação para colar no
// Excel/Sheets do clube — porta de describeEvent/exportText do banco.html.
import { eventosEfetivos } from "./annul";
import { TRANSICAO_NUMEROS_VANTAGEM } from "./goalTypes";
import { isTimeoutPause } from "./liveMatch";
import { periodLabel } from "./matchFormat";
import { tipoGoloLabel } from "./goalTypes";
import { fmtMinSec } from "./time";
import type { MatchEvent, MatchFormat, MatchRow, Player, Score } from "./types";

export type PlayerLookup = (id: string) => Player | undefined;

function eventMs(e: MatchEvent): number {
  return e.ms ?? (e.min ?? 0) * 60000 + (e.sec ?? 0) * 1000;
}

function eventStamp(e: MatchEvent, format?: MatchFormat): string {
  return `${periodLabel(e.period, format)} · ${fmtMinSec(eventMs(e))}`;
}

/** "Transição 3x1 (baliza deserta)" quando dá pra detalhar; senão só o rótulo normal do tipo. */
function goloTipoLabelComDetalhe(e: MatchEvent): string | null {
  const lbl = tipoGoloLabel(e.tipo);
  if (!lbl || e.tipo !== "trs") return lbl;
  const numeros = e.transicaoNumeros ? ` ${e.transicaoNumeros}` : "";
  const deserta = e.transicaoBalizaDeserta ? " (baliza deserta)" : "";
  return `${lbl}${numeros}${deserta}`;
}

const DESFECHO_LABEL: Record<string, string> = { defendido: "defendido", fora: "fora", bloqueado: "bloqueado" };
const ZONA3_LABEL: Record<string, string> = { defesa: "defesa", meio: "meio-campo", ataque: "ataque" };

function zonaSufixo(e: MatchEvent): string {
  return e.zona ? ` [Zona ${e.zona}]` : "";
}

export function describeEvent(e: MatchEvent, playerById: PlayerLookup, format?: MatchFormat): string {
  const p = e.playerId ? playerById(e.playerId) : undefined;
  const pname = p ? `#${p.num} ${p.name}` : "";
  const t = `[${eventStamp(e, format)}] `;
  let body: string;

  switch (e.type) {
    case "kickoff":
      body = e.label || "Início/retoma do relógio";
      break;
    case "pausa":
      body = e.label || "Pausa";
      break;
    case "fim_pausa":
      body = `Fim da pausa — ${e.label || "Pausa"} (${fmtMinSec((e.duracaoSec || 0) * 1000)})`;
      break;
    case "fim_periodo": {
      body = `${e.label || "Fim da parte"} (${fmtMinSec((e.duracaoSec || 0) * 1000)} jogados)`;
      const ps = e.playerSeconds || {};
      const keys = Object.keys(ps);
      if (keys.length) {
        const somaMin = keys.reduce((acc, id) => acc + ps[id], 0) / 60;
        const esperadoMin = (5 * (e.duracaoSec || 0)) / 60;
        body += ` · validação: ${Math.round(somaMin * 10) / 10} min-jogador (esperado 5×${fmtMinSec(
          (e.duracaoSec || 0) * 1000
        )} = ${Math.round(esperadoMin * 10) / 10})`;
      }
      break;
    }
    case "golo": {
      const assistP = e.assistId ? playerById(e.assistId) : undefined;
      const lineupNames = (e.lineup || []).map((id) => playerById(id)?.num ?? "?").join(",");
      const tipoLbl = goloTipoLabelComDetalhe(e);
      const zonaLbl = e.zona ? `Zona ${e.zona}` : null;
      body =
        `GOLO — ${pname}` +
        (assistP ? ` (assist. #${assistP.num} ${assistP.name})` : "") +
        (tipoLbl ? ` [${tipoLbl}]` : "") +
        (zonaLbl ? ` [${zonaLbl}]` : "") +
        (lineupNames ? ` | em quadra: ${lineupNames}` : "");
      break;
    }
    case "golo_sofrido": {
      const lineupNames = (e.lineup || []).map((id) => playerById(id)?.num ?? "?").join(",");
      const tipoLbl = goloTipoLabelComDetalhe(e);
      const zonaLbl = e.zona ? `Zona ${e.zona}` : null;
      body =
        "Golo sofrido (adversário)" +
        (tipoLbl ? ` [${tipoLbl}]` : "") +
        (zonaLbl ? ` [${zonaLbl}]` : "") +
        (lineupNames ? ` | em quadra: ${lineupNames}` : "");
      break;
    }
    case "cartao_amarelo":
      body = `Cartão amarelo — ${pname}${zonaSufixo(e)}`;
      break;
    case "cartao_vermelho":
      body = `Cartão vermelho — ${pname}${zonaSufixo(e)}`;
      break;
    case "falta":
      body = `Falta cometida — ${pname}${zonaSufixo(e)}`;
      break;
    case "falta_sofrida":
      body = `Falta sofrida — ${pname}${zonaSufixo(e)}`;
      break;
    // Captura detalhada (specs/009-captura-detalhada/data-model.md)
    case "remate":
      body = `Remate ${DESFECHO_LABEL[e.desfecho ?? ""] ?? ""} — ${pname}${zonaSufixo(e)}`;
      break;
    case "remate_adv":
      body = `Remate do adversário ${DESFECHO_LABEL[e.desfecho ?? ""] ?? ""}${zonaSufixo(e)}`;
      break;
    case "defesa":
      body = `Defesa (remate do adversário defendido) — ${pname}${zonaSufixo(e)}`;
      break;
    case "saida":
      body = `Saída 1x1 ${e.resultado === "ganha" ? "ganha" : "perdida"} — ${pname}${zonaSufixo(e)}`;
      break;
    case "transicao":
      body =
        `Transição ${e.dir === "defensiva" ? "contra" : "a favor"}` +
        (e.transicaoNumeros ? ` ${e.transicaoNumeros}` : "") +
        ` — ${e.resultado === "ganha" ? "com" : "sem"} finalização`;
      break;
    case "perda":
      body = `Perda de bola — ${ZONA3_LABEL[e.zona3 ?? ""] ?? ""}`;
      break;
    case "recuperacao":
      body = `Recuperação de bola — ${ZONA3_LABEL[e.zona3 ?? ""] ?? ""}`;
      break;
    case "goleiro_linha_inicio":
      body = "Goleiro-linha — início";
      break;
    case "goleiro_linha_fim":
      body = `Goleiro-linha — fim (${fmtMinSec((e.durSec || 0) * 1000)})`;
      break;
    case "anulacao":
      body = "Anulação de um lance";
      break;
    case "lesao_inicio":
      body = `Atendimento iniciado — ${pname}`;
      break;
    case "lesao_fim":
      body = `Atendimento terminado — ${pname} (${Math.round(((e.durSec || 0) / 60) * 10) / 10} min)`;
      break;
    case "substituicao": {
      const outP = e.outId ? playerById(e.outId) : undefined;
      body = `Substituição — entra ${pname}` + (outP ? `, sai #${outP.num} ${outP.name}` : "");
      break;
    }
    default:
      body = e.type;
  }

  if (e.correcao) body += e.aproximado ? " [correção — momento aproximado]" : " [correção]";
  return t + body;
}

/**
 * Reconstrói quem está em quadra evento a evento, na ordem cronológica —
 * pra cada evento, guarda tanto o "antes" (onCourt no instante imediatamente
 * anterior a este evento, o que importa pra decidir se uma substituição faz
 * sentido: quem entra não pode já estar lá, quem sai tem que estar) quanto o
 * "depois" (já com este evento aplicado, o que importa pra exibir ao lado de
 * um golo). Mesmo teto de 5 que `replay.ts` usa — nunca deixa o array
 * crescer além disso, mesmo com um evento incongruente (ex.: um "entra" sem
 * o "sai" correspondente). Única fonte de verdade desta reconstrução —
 * `describeEvents` (abaixo) e a validação da Registo (MatchEventEditor)
 * reaproveitam esta função em vez de cada um repetir a própria lógica.
 */
export function onCourtTimeline(events: MatchEvent[]): Map<string, { before: string[]; after: string[] }> {
  const sorted = [...events].sort((a, b) => (a.period - b.period) || (eventMs(a) - eventMs(b)) || (a.ts - b.ts));
  let onCourt: string[] = [];
  const result = new Map<string, { before: string[]; after: string[] }>();
  for (const e of sorted) {
    const before = onCourt;
    if (e.type === "kickoff" && e.lineup) onCourt = e.lineup;
    if (e.type === "substituicao") {
      if (e.outId) onCourt = onCourt.filter((id) => id !== e.outId);
      if (e.playerId && !onCourt.includes(e.playerId) && onCourt.length < 5) onCourt = [...onCourt, e.playerId];
    }
    if (e.type === "cartao_vermelho" && e.playerId) onCourt = onCourt.filter((id) => id !== e.playerId);
    result.set(e.id, { before, after: onCourt });
  }
  return result;
}

/**
 * Durações recalculadas a partir das horas dos próprios eventos — fim de
 * pausa (desde a "pausa" anterior da mesma parte), fim de parte (o ms do
 * próprio fim) e fim de atendimento (desde o início do mesmo atleta). O valor
 * gravado no evento (`duracaoSec`/`durSec`) é o do momento em que foi criado
 * e fica velho quando a Registo corrige uma das horas (achado real: "Fim da
 * pausa (02:18)" num pedido de tempo corrigido para 1:32). Minutos e placar
 * já usavam as horas (replay.ts); só o texto e o eixo da timeline não.
 */
export function duracoesDerivadas(events: MatchEvent[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => (a.period - b.period) || (eventMs(a) - eventMs(b)) || (a.ts - b.ts));
  const out = new Map<string, number>();
  const pausaAberta = new Map<number, MatchEvent>();
  const atendimentoAberto = new Map<string, MatchEvent>();
  for (const e of sorted) {
    if (e.type === "pausa") pausaAberta.set(e.period, e);
    else if (e.type === "fim_pausa") {
      const inicio = pausaAberta.get(e.period);
      if (inicio) out.set(e.id, Math.max(0, Math.round((eventMs(e) - eventMs(inicio)) / 1000)));
      pausaAberta.delete(e.period);
    } else if (e.type === "fim_periodo") out.set(e.id, Math.round(eventMs(e) / 1000));
    else if (e.type === "lesao_inicio") atendimentoAberto.set(`${e.period}|${e.playerId}`, e);
    else if (e.type === "lesao_fim") {
      const key = `${e.period}|${e.playerId}`;
      const inicio = atendimentoAberto.get(key);
      if (inicio) out.set(e.id, Math.max(0, Math.round((eventMs(e) - eventMs(inicio)) / 1000)));
      atendimentoAberto.delete(key);
    }
  }
  return out;
}

/**
 * Descreve TODOS os eventos de um jogo de uma vez, recalculando quem estava
 * em quadra em cada golo a partir da ordem cronológica ATUAL dos eventos —
 * nunca confiando no `lineup` gravado dentro do próprio evento no momento em
 * que foi criado. Esse valor gravado fica desatualizado sempre que uma
 * substituição é corrigida ou inserida depois (ver MatchEventEditor) com um
 * tempo anterior a um golo já registado: o golo continuaria mostrando quem
 * estava em quadra segundo a ordem ANTIGA, não a corrigida. Devolve um mapa
 * id→descrição, na ordem cronológica interna, pra quem exibe (reversa ou
 * não) só precisar de events.map(e => mapa.get(e.id)).
 */
export function describeEvents(events: MatchEvent[], playerById: PlayerLookup, format?: MatchFormat): Map<string, string> {
  const timeline = onCourtTimeline(events);
  const duracoes = duracoesDerivadas(events);
  const result = new Map<string, string>();
  for (const e of events) {
    const after = timeline.get(e.id)?.after ?? [];
    let forDisplay = e.type === "golo" || e.type === "golo_sofrido" ? { ...e, lineup: after.slice() } : e;
    const d = duracoes.get(e.id);
    if (d !== undefined) forDisplay = e.type === "lesao_fim" ? { ...forDisplay, durSec: d } : { ...forDisplay, duracaoSec: d };
    if (e.type === "anulacao") {
      const alvo = events.find((x) => (x.clientEventId ?? x.id) === e.alvoId);
      const alvoTxt = alvo ? describeEvent(alvo, playerById, format) : "lance desconhecido";
      result.set(e.id, `[${eventStamp(e, format)}] Anulado: ${alvoTxt}${e.correcao ? " [correção]" : ""}`);
      continue;
    }
    result.set(e.id, describeEvent(forDisplay, playerById, format));
  }
  return result;
}

export interface MatchMeta {
  jornada?: string | null;
  date?: string | null;
  adversario?: string | null;
}

export interface MatchEventExport {
  id: string;
  type: MatchEvent["type"];
  period: number;
  /** Segundos decorridos de tempo de jogo dentro da parte — nunca tempo de vídeo (ver nota em buildEventsExport). */
  timeSec: number;
  timeLabel: string;
  playerId: string | null;
  playerName: string | null;
  outPlayerId: string | null;
  outPlayerName: string | null;
  assistPlayerId: string | null;
  assistPlayerName: string | null;
  description: string;
}

export interface MatchEventsExport {
  adversario: string | null;
  ourLabel: string | null;
  score: Score;
  events: MatchEventExport[];
}

/**
 * Exportação estruturada (JSON) do registo cronológico — pensada pra servir
 * de entrada pra uma ferramenta externa de corte de vídeo por lance (nunca
 * processa ou referencia vídeo aqui, só entrega "o que aconteceu, em que
 * parte, em que segundo de tempo de JOGO"). Quem for cortar vídeo é quem
 * sabe converter isso pro tempo absoluto do próprio ficheiro — essa
 * exportação não assume nenhum offset entre os dois.
 *
 * Reaproveita describeEvents (não duplica a lógica de descrição textual do
 * "Copiar resumo") e devolve os eventos já ordenados cronologicamente.
 */
export function buildEventsExport(
  events: MatchEvent[],
  playerById: PlayerLookup,
  format: MatchFormat | undefined,
  meta: { adversario?: string | null; ourLabel?: string | null; score: Score }
): MatchEventsExport {
  const sorted = [...events].sort((a, b) => a.period - b.period || eventMs(a) - eventMs(b) || a.ts - b.ts);
  const descriptions = describeEvents(sorted, playerById, format);
  const nameOf = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const p = playerById(id);
    return p ? `#${p.num} ${p.name}` : null;
  };
  return {
    adversario: meta.adversario ?? null,
    ourLabel: meta.ourLabel ?? null,
    score: meta.score,
    events: sorted.map((e) => ({
      id: e.id,
      type: e.type,
      period: e.period,
      timeSec: Math.round(eventMs(e) / 1000),
      timeLabel: fmtMinSec(eventMs(e)),
      playerId: e.playerId,
      playerName: nameOf(e.playerId),
      outPlayerId: e.outId ?? null,
      outPlayerName: nameOf(e.outId),
      assistPlayerId: e.assistId ?? null,
      assistPlayerName: nameOf(e.assistId),
      description: descriptions.get(e.id) ?? describeEvent(e, playerById, format),
    })),
  };
}

/** Texto tabulado pronto para colar na folha "Jogo - Registo" do Excel do clube. */
export function exportText(
  rows: MatchRow[],
  events: MatchEvent[],
  score: Score,
  playerById: PlayerLookup,
  format?: MatchFormat,
  ourLabel?: string | null,
  opponentLabel?: string | null
): string {
  const lines: string[] = [];
  lines.push('REGISTO DE JOGO — cole estas linhas na folha "Jogo - Registo" (uma por atleta)');
  lines.push("Jornada\tData\tAdversário\tAtleta\tConvocado?\tTitular?\tMinutos Jogados\tGolos\tAssistências\tCartão Amarelo\tCartão Vermelho\tNotas");
  // Uma célula por coluna do cabeçalho (12): antes as linhas começavam pelo
  // número da camisola e tinham só 10 células, e ao colar na folha ficava tudo
  // 3 colunas desalinhado. Jornada e Data ficam por preencher na folha.
  rows.forEach((r) => {
    lines.push(["", "", opponentLabel ?? "", r.nome, r.convocado, r.titular, r.min, r.golos, r.assist, r.ca, r.cv, ""].join("\t"));
  });
  lines.push("");
  lines.push(`Resultado: ${ourLabel || "Nós"} ${score.nos} - ${score.advers} ${opponentLabel || "Adversário"}`);
  lines.push("");
  lines.push("REGISTO CRONOLÓGICO (golos, cartões, faltas, atendimentos, substituições)");
  const descriptions = describeEvents(events, playerById, format);
  events.forEach((e) => lines.push(descriptions.get(e.id) ?? describeEvent(e, playerById, format)));
  return lines.join("\n");
}

/**
 * Transições ofensivas desperdiçadas com vantagem numérica real (FR-019,
 * FR-020; research Decisão 8): a favor (`dir` ofensiva), sem finalização
 * (`resultado` perdida) e com uma superioridade de TRANSICAO_NUMEROS_VANTAGEM
 * — nunca igualdade/desvantagem, nunca com finalização, nunca anuladas.
 * Ordem cronológica.
 */
export function transicoesDesperdicadas(events: MatchEvent[]): MatchEvent[] {
  return eventosEfetivos(events)
    .filter(
      (e) =>
        e.type === "transicao" &&
        e.dir === "ofensiva" &&
        e.resultado === "perdida" &&
        !!e.transicaoNumeros &&
        TRANSICAO_NUMEROS_VANTAGEM.includes(e.transicaoNumeros)
    )
    .sort((a, b) => (a.period - b.period) || (eventMs(a) - eventMs(b)));
}

export interface LinhaResumo {
  label: string;
  /** Contagem por parte (índice = número da parte) e total. */
  porParte: Record<number, number>;
  total: number;
}

/**
 * Totais da captura detalhada (Consola) por parte e no jogo, sempre sobre os
 * eventos efetivos (sem anulados) — para o Resumo do jogo (FR-021). Só as
 * linhas com pelo menos um lance; lista vazia = jogo sem captura detalhada.
 */
export function resumoDetalhado(events: MatchEvent[]): LinhaResumo[] {
  const efetivos = eventosEfetivos(events);
  const linhas: { label: string; conta: (e: MatchEvent) => boolean }[] = [
    { label: "Remates — golo", conta: (e) => e.type === "golo" },
    { label: "Remates — defendidos", conta: (e) => e.type === "remate" && e.desfecho === "defendido" },
    { label: "Remates — fora", conta: (e) => e.type === "remate" && e.desfecho === "fora" },
    { label: "Remates — bloqueados", conta: (e) => e.type === "remate" && e.desfecho === "bloqueado" },
    { label: "Remates deles — golo sofrido", conta: (e) => e.type === "golo_sofrido" },
    { label: "Remates deles — defendidos (GR)", conta: (e) => e.type === "defesa" },
    { label: "Remates deles — fora", conta: (e) => e.type === "remate_adv" && e.desfecho === "fora" },
    { label: "Remates deles — bloqueados", conta: (e) => e.type === "remate_adv" && e.desfecho === "bloqueado" },
    { label: "Transições a favor — com finalização", conta: (e) => e.type === "transicao" && e.dir === "ofensiva" && e.resultado === "ganha" },
    { label: "Transições a favor — sem finalização", conta: (e) => e.type === "transicao" && e.dir === "ofensiva" && e.resultado === "perdida" },
    { label: "Transições contra — com finalização", conta: (e) => e.type === "transicao" && e.dir === "defensiva" && e.resultado === "ganha" },
    { label: "Transições contra — sem finalização", conta: (e) => e.type === "transicao" && e.dir === "defensiva" && e.resultado === "perdida" },
    { label: "Perdas — defesa", conta: (e) => e.type === "perda" && e.zona3 === "defesa" },
    { label: "Perdas — meio-campo", conta: (e) => e.type === "perda" && e.zona3 === "meio" },
    { label: "Perdas — ataque", conta: (e) => e.type === "perda" && e.zona3 === "ataque" },
    { label: "Recuperações — defesa", conta: (e) => e.type === "recuperacao" && e.zona3 === "defesa" },
    { label: "Recuperações — meio-campo", conta: (e) => e.type === "recuperacao" && e.zona3 === "meio" },
    { label: "Recuperações — ataque", conta: (e) => e.type === "recuperacao" && e.zona3 === "ataque" },
    { label: "Saídas 1x1 do GR — ganhas", conta: (e) => e.type === "saida" && e.resultado === "ganha" },
    { label: "Saídas 1x1 do GR — perdidas", conta: (e) => e.type === "saida" && e.resultado === "perdida" },
  ];
  // Só faz sentido mostrar se houve captura detalhada (pelo menos um tipo novo).
  const detalhados = new Set<MatchEvent["type"]>(["remate", "remate_adv", "defesa", "saida", "transicao", "perda", "recuperacao"]);
  if (!efetivos.some((e) => detalhados.has(e.type))) return [];
  return linhas
    .map(({ label, conta }) => {
      const porParte: Record<number, number> = {};
      let total = 0;
      for (const e of efetivos) {
        if (!conta(e)) continue;
        porParte[e.period] = (porParte[e.period] ?? 0) + 1;
        total++;
      }
      return { label, porParte, total };
    })
    .filter((l) => l.total > 0);
}

/** Duração de referência de um pedido de tempo (o que o árbitro acrescenta). Acima disto, a pausa é destacada. */
export const PEDIDO_TEMPO_REF_SEC = 60;

export interface PausaResumo {
  period: number;
  label: string;
  /** Pedido de tempo (desconta minutos) vs. outro motivo (não desconta). */
  timeout: boolean;
  startMs: number;
  endMs: number;
  durSec: number;
  /** Segundos acima de 1:00 num pedido de tempo (0 se não passou, ou se não é pedido de tempo). */
  acimaSec: number;
}

export interface ParteResumo {
  period: number;
  /** Duração registada da parte (ms do fim de parte). */
  duracaoSec: number;
  /** Soma dos pedidos de tempo da parte (o que é descontado aos minutos). */
  descontoSec: number;
  efetivoSec: number;
  /** Duração regulamentar da parte pelo formato do jogo, ou null sem formato. */
  nominalSec: number | null;
}

/**
 * Pausas e tempo efetivo por parte, a partir das horas dos eventos (como
 * `duracoesDerivadas` — reflete correções da Registo). Só os pedidos de
 * tempo descontam minutos (isTimeoutPause); uma pausa ainda aberta no fim da
 * parte fecha aí. Só leitura — para o Resumo e a Timeline mostrarem porque
 * quem jogou a parte toda pode ficar abaixo da duração regulamentar.
 */
export function resumoPausas(events: MatchEvent[], format?: MatchFormat): { pausas: PausaResumo[]; partes: ParteResumo[] } {
  const sorted = [...events].sort((a, b) => (a.period - b.period) || (eventMs(a) - eventMs(b)) || (a.ts - b.ts));
  const pausas: PausaResumo[] = [];
  const partes: ParteResumo[] = [];
  let aberta: MatchEvent | null = null;
  const fechar = (fimMs: number) => {
    if (!aberta) return;
    const timeout = isTimeoutPause(aberta.reasonId);
    const durSec = Math.max(0, Math.round((fimMs - eventMs(aberta)) / 1000));
    pausas.push({
      period: aberta.period,
      label: aberta.label || (timeout ? "Pedido de tempo" : "Pausa"),
      timeout,
      startMs: eventMs(aberta),
      endMs: fimMs,
      durSec,
      acimaSec: timeout ? Math.max(0, durSec - PEDIDO_TEMPO_REF_SEC) : 0,
    });
    aberta = null;
  };
  for (const e of sorted) {
    if (e.type === "pausa") {
      fechar(eventMs(e));
      aberta = e;
    } else if (e.type === "fim_pausa") fechar(eventMs(e));
    else if (e.type === "fim_periodo") {
      fechar(eventMs(e));
      const duracaoSec = Math.round(eventMs(e) / 1000);
      const descontoSec = pausas.filter((p) => p.period === e.period && p.timeout).reduce((a, p) => a + p.durSec, 0);
      const nominalSec = format ? (e.period <= format.periodCount ? format.periodMinutes : format.overtimeMinutes) * 60 : null;
      partes.push({ period: e.period, duracaoSec, descontoSec, efetivoSec: Math.max(0, duracaoSec - descontoSec), nominalSec });
    }
  }
  return { pausas, partes };
}
