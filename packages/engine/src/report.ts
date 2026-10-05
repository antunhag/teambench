// Descrição em texto do registo cronológico e exportação para colar no
// Excel/Sheets do clube — porta de describeEvent/exportText do banco.html.
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
      body = `Cartão amarelo — ${pname}`;
      break;
    case "cartao_vermelho":
      body = `Cartão vermelho — ${pname}`;
      break;
    case "falta":
      body = `Falta cometida — ${pname}`;
      break;
    case "falta_sofrida":
      body = `Falta sofrida — ${pname}`;
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
  const sorted = [...events].sort((a, b) => (a.period - b.period) || (eventMs(a) - eventMs(b)) || (a.ts - b.ts));
  let onCourt: string[] = [];
  const result = new Map<string, string>();
  for (const e of sorted) {
    if (e.type === "kickoff" && e.lineup) onCourt = e.lineup;
    if (e.type === "substituicao") {
      if (e.outId) onCourt = onCourt.filter((id) => id !== e.outId);
      if (e.playerId && !onCourt.includes(e.playerId)) onCourt = [...onCourt, e.playerId];
    }
    if (e.type === "cartao_vermelho" && e.playerId) onCourt = onCourt.filter((id) => id !== e.playerId);
    const forDisplay = e.type === "golo" || e.type === "golo_sofrido" ? { ...e, lineup: onCourt.slice() } : e;
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
  rows.forEach((r) => {
    lines.push([r.num, r.nome, r.convocado, r.titular, r.min, r.golos, r.assist, r.ca, r.cv, ""].join("\t"));
  });
  lines.push("");
  lines.push(`Resultado: ${ourLabel || "Nós"} ${score.nos} - ${score.advers} ${opponentLabel || "Adversário"}`);
  lines.push("");
  lines.push("REGISTO CRONOLÓGICO (golos, cartões, faltas, atendimentos, substituições)");
  const descriptions = describeEvents(events, playerById, format);
  events.forEach((e) => lines.push(descriptions.get(e.id) ?? describeEvent(e, playerById, format)));
  return lines.join("\n");
}
