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
      const tipoLbl = tipoGoloLabel(e.tipo);
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
      const tipoLbl = tipoGoloLabel(e.tipo);
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

export interface MatchMeta {
  jornada?: string | null;
  date?: string | null;
  adversario?: string | null;
}

/** Texto tabulado pronto para colar na folha "Jogo - Registo" do Excel do clube. */
export function exportText(rows: MatchRow[], events: MatchEvent[], score: Score, playerById: PlayerLookup, format?: MatchFormat): string {
  const lines: string[] = [];
  lines.push('REGISTO DE JOGO — cole estas linhas na folha "Jogo - Registo" (uma por atleta)');
  lines.push("Jornada\tData\tAdversário\tAtleta\tConvocado?\tTitular?\tMinutos Jogados\tGolos\tAssistências\tCartão Amarelo\tCartão Vermelho\tNotas");
  rows.forEach((r) => {
    lines.push([r.num, r.nome, r.convocado, r.titular, r.min, r.golos, r.assist, r.ca, r.cv, ""].join("\t"));
  });
  lines.push("");
  lines.push(`Resultado: Nós ${score.nos} - ${score.advers} Adversário`);
  lines.push("");
  lines.push("REGISTO CRONOLÓGICO (golos, cartões, faltas, atendimentos, substituições)");
  events.forEach((e) => lines.push(describeEvent(e, playerById, format)));
  return lines.join("\n");
}
