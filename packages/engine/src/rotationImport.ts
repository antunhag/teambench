// Importar um plano de rotação a partir de texto (ex.: copiado de uma folha
// de cálculo do clube). Lógica pura: lê, encontra os atletas no plantel e
// valida com as mesmas regras do planeador (rotationPlan.ts) — quem chama
// mostra os erros e só grava se não houver nenhum.
//
// Formato, uma vaga por linha:
//   Fixo: Dinis 0-5, Marcelo G 5-8, Dinis 8-16
//   Ala esquerda: Martim S 0-3; Leonardo 3-5
// Tempos em minutos ("5") ou mm:ss ("5:30"); separador "-", "–" ou "—".
// Vagas: Fixo/FX, Ala esquerda/Ala esq/AE, Ala direita/Ala dir/AD, Pivô/Pivo/PV.
// Linhas "Parte 2" mudam a parte das linhas seguintes; sem nenhuma, o plano
// vale para a parte 1 ou, com `applyToAllPeriods`, para todas as partes.
import { playerOverlapsOtherSlot, ROTATION_SLOT_TYPES, stintsOverlap, type RotationStint } from "./rotationPlan";

export interface ImportPlayer {
  id: string;
  name: string;
  num?: string | null;
}

export interface RotationImportOptions {
  periodSec: number;
  periodCount: number;
  applyToAllPeriods: boolean;
}

export interface RotationImportResult {
  stints: RotationStint[];
  /** Impedem a gravação. */
  errors: string[];
  /** Só avisos (ex.: minutos sem ninguém numa vaga). */
  warnings: string[];
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const SLOT_ALIASES: Record<string, number> = {
  fixo: 0,
  fx: 0,
  "ala esquerda": 1,
  "ala esq": 1,
  "ala esq.": 1,
  ae: 1,
  "ala direita": 2,
  "ala dir": 2,
  "ala dir.": 2,
  ad: 2,
  pivo: 3,
  pv: 3,
};

function parseTime(t: string): number | null {
  const m = t.match(/^(\d{1,3})(?::([0-5]\d))?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, "0")}` : `${m}`;
}

/** Nome exato (sem acentos/maiúsculas), ou "#número", ou um prefixo que só sirva a um atleta. */
function findPlayer(raw: string, players: ImportPlayer[]): { player?: ImportPlayer; error?: string } {
  const q = norm(raw);
  const byNum = q.match(/^#?(\d+)$/);
  if (byNum) {
    const hits = players.filter((p) => (p.num ?? "") === byNum[1]);
    if (hits.length === 1) return { player: hits[0] };
  }
  const exact = players.filter((p) => norm(p.name) === q);
  if (exact.length === 1) return { player: exact[0] };
  if (exact.length > 1) return { error: `"${raw}" é ambíguo (${exact.map((p) => `#${p.num ?? "?"} ${p.name}`).join(", ")}) — use o número, ex.: #${exact[0].num ?? ""}` };
  const prefix = players.filter((p) => norm(p.name).startsWith(q + " "));
  if (prefix.length === 1) return { player: prefix[0] };
  if (prefix.length > 1) return { error: `"${raw}" é ambíguo (${prefix.map((p) => p.name).join(", ")}) — escreva o nome completo` };
  return { error: `"${raw}" não está no plantel` };
}

export function parseRotationText(text: string, players: ImportPlayer[], opts: RotationImportOptions): RotationImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed: RotationStint[] = [];
  let period = 1;
  let sawPeriodHeader = false;

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    const where = `Linha ${i + 1}`;
    if (!line || line.startsWith("#")) return;
    const header = line.match(/^parte\s*(\d+)\s*:?$/i);
    if (header) {
      period = parseInt(header[1], 10);
      sawPeriodHeader = true;
      if (period < 1 || period > opts.periodCount) errors.push(`${where}: este jogo só tem ${opts.periodCount} partes`);
      return;
    }
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) {
      errors.push(`${where}: esperado "Vaga: Atleta início-fim, …"`);
      return;
    }
    const slotIndex = SLOT_ALIASES[norm(m[1])];
    if (slotIndex === undefined) {
      errors.push(`${where}: vaga "${m[1].trim()}" desconhecida (use Fixo, Ala esquerda, Ala direita ou Pivô)`);
      return;
    }
    for (const item of m[2].split(/[,;·]/).map((x) => x.trim()).filter(Boolean)) {
      const im = item.match(/^(.+?)\s+(\d{1,3}(?::[0-5]\d)?)\s*[-–—]\s*(\d{1,3}(?::[0-5]\d)?)$/);
      if (!im) {
        errors.push(`${where}: "${item}" — esperado "Atleta início-fim", ex.: "Dinis 0-5"`);
        continue;
      }
      const found = findPlayer(im[1], players);
      if (!found.player) {
        errors.push(`${where}: ${found.error}`);
        continue;
      }
      parsed.push({ playerId: found.player.id, slotIndex, period, startSec: parseTime(im[2])!, endSec: parseTime(im[3])! });
    }
  });

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const labelOf = (s: RotationStint) => `${ROTATION_SLOT_TYPES[s.slotIndex]}, parte ${s.period}, ${nameOf(s.playerId)} ${fmt(s.startSec)}-${fmt(s.endSec)}`;

  // Horários validados antes de replicar pelas partes — um erro aparece uma vez só.
  const validTimes = parsed.filter((s) => {
    if (s.startSec >= s.endSec) errors.push(`${labelOf(s)}: o fim tem de ser depois do início`);
    else if (s.endSec > opts.periodSec) errors.push(`${labelOf(s)}: passa do fim da parte (${fmt(opts.periodSec)} min)`);
    else return true;
    return false;
  });

  const periods = !sawPeriodHeader && opts.applyToAllPeriods ? Array.from({ length: opts.periodCount }, (_, k) => k + 1) : null;
  const candidates = periods ? periods.flatMap((p) => validTimes.map((s) => ({ ...s, period: p }))) : validTimes;

  const accepted: RotationStint[] = [];
  for (const s of candidates) {
    const label = labelOf(s);
    if (stintsOverlap(accepted, s.slotIndex, s.period, s.startSec, s.endSec)) {
      errors.push(`${label}: sobrepõe-se a outro turno da mesma vaga`);
      continue;
    }
    const clash = playerOverlapsOtherSlot(accepted, s.playerId, s.period, s.slotIndex, s.startSec, s.endSec);
    if (clash) {
      errors.push(`${label}: já está em ${ROTATION_SLOT_TYPES[clash.slotIndex]} nesse horário (${fmt(clash.startSec)}-${fmt(clash.endSec)})`);
      continue;
    }
    accepted.push(s);
  }

  // Buracos: só aviso — o planeador manual nunca os cria, mas um plano
  // importado pode querer deixar uma vaga por definir.
  const usedPeriods = Array.from(new Set(accepted.map((s) => s.period))).sort();
  for (const p of usedPeriods) {
    ROTATION_SLOT_TYPES.forEach((slot, slotIndex) => {
      const list = accepted.filter((s) => s.period === p && s.slotIndex === slotIndex).sort((a, b) => a.startSec - b.startSec);
      let cursor = 0;
      for (const s of list) {
        if (s.startSec > cursor) warnings.push(`${slot}, parte ${p}: ninguém de ${fmt(cursor)} a ${fmt(s.startSec)}`);
        cursor = Math.max(cursor, s.endSec);
      }
      if (cursor < opts.periodSec) warnings.push(`${slot}, parte ${p}: ninguém de ${fmt(cursor)} a ${fmt(opts.periodSec)}`);
    });
  }

  if (!errors.length && !accepted.length) errors.push("Nenhum turno encontrado no texto.");
  return { stints: accepted, errors, warnings };
}
