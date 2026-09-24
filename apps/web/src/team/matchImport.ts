// Importação em lote do calendário de jogos — mesmo padrão do plantel: cola
// linhas de uma planilha (Data, Adversário, Competição, Local, Hora), casa
// jogos já existentes por (data + adversário) para não duplicar ao colar de
// novo, e nunca apaga um jogo sozinho.

export interface ExistingMatch {
  id: string;
  matchDate: string; // ISO yyyy-mm-dd
  opponent: string | null;
  formatId: string | null;
}

export interface MatchUpsert {
  id: string;
  team_id: string;
  format_id: string | null;
  match_date: string;
  opponent: string;
  competition: string | null;
  location: string | null;
  kickoff_time: string | null;
}

export interface MatchImportResult {
  upserts: MatchUpsert[];
  added: number;
  updated: number;
  skipped: number;
}

/** Aceita dd/mm/aaaa ou aaaa-mm-dd; devolve ISO (aaaa-mm-dd) ou null se não reconhecer. */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * Aceita HH:MM, HH:MM:SS, ou o formato comum em pt-PT "20h00"/"20h"; devolve
 * HH:MM ou null se não reconhecer. É opcional e não bloqueia a linha — ao
 * contrário da data/adversário, um valor de hora que o Postgres rejeitaria
 * (ex.: "20h00" direto na coluna `time`) já travou uma importação inteira no
 * passado, porque o upsert é um único lote: uma linha inválida derrubava
 * todas as outras.
 */
function parseTime(raw: string | undefined): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const colon = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (colon) {
    const [, h, m] = colon;
    return `${h.padStart(2, "0")}:${m}`;
  }
  const hLetter = /^(\d{1,2})[hH](\d{2})?$/.exec(s);
  if (hLetter) {
    const [, h, m] = hLetter;
    return `${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
  }
  return null;
}

export function parseMatchImport(
  text: string,
  teamId: string,
  defaultFormatId: string | null,
  existing: ExistingMatch[]
): MatchImportResult {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const byKey = new Map(existing.map((m) => [`${m.matchDate}|${(m.opponent || "").toLowerCase()}`, m]));
  const upserts: MatchUpsert[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const line of lines) {
    const fields = (line.includes("\t") ? line.split("\t") : line.split(",")).map((f) => f.trim());
    if (fields.length < 2) {
      skipped++;
      continue;
    }
    const [dateRaw, opponent, competition, location, kickoff] = fields;
    if (/^data/i.test(dateRaw) || /^adversário/i.test(opponent || "")) continue; // cabeçalho
    const matchDate = parseDate(dateRaw);
    if (!matchDate || !opponent) {
      skipped++;
      continue;
    }
    const key = `${matchDate}|${opponent.toLowerCase()}`;
    const existingMatch = byKey.get(key);
    upserts.push({
      id: existingMatch?.id ?? crypto.randomUUID(),
      team_id: teamId,
      // Preserva o formato já definido manualmente num jogo existente — o
      // padrão da equipa só é usado para jogos novos ou que nunca tiveram um.
      format_id: existingMatch ? existingMatch.formatId ?? defaultFormatId : defaultFormatId,
      match_date: matchDate,
      opponent,
      competition: competition || null,
      location: location || null,
      kickoff_time: parseTime(kickoff),
    });
    if (existingMatch) updated++;
    else added++;
  }

  return { upserts, added, updated, skipped };
}
