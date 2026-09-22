// Porta de importRosterFromText do banco.html: cola linhas do Excel/Sheets
// (Nº, Nome, Posição) e atualiza/acrescenta o plantel. Casa atletas
// existentes SÓ pelo nome (nunca pelo número) — se dois atletas diferentes
// tiverem o mesmo número por engano no ficheiro de origem, casar por número
// faria o segundo "engolir" o primeiro silenciosamente. Nunca remove
// ninguém sozinho: isso é sempre uma ação manual separada (desativar).
import { guessPosition, type Position } from "./positions";

export interface ExistingPlayer {
  id: string;
  num: string | null;
  name: string;
}

export interface PlayerUpsert {
  id: string; // existente (update) ou novo crypto.randomUUID() (insert)
  team_id: string;
  name: string;
  number: string;
  position: Position;
}

export interface RosterImportResult {
  upserts: PlayerUpsert[];
  added: number;
  updated: number;
  skipped: number;
  dupNums: string[];
}

export function parseRosterImport(text: string, teamId: string, existing: ExistingPlayer[]): RosterImportResult {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const byNameLower = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
  const upserts: PlayerUpsert[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const line of lines) {
    const fields = (line.includes("\t") ? line.split("\t") : line.split(",")).map((f) => f.trim());
    if (fields.length < 2) {
      skipped++;
      continue;
    }
    const [numRaw, nome] = fields;
    if (/^n[ºo°]?$/i.test(numRaw) || /^nome/i.test(nome)) continue; // cabeçalho
    if (!nome) {
      skipped++;
      continue;
    }
    const pos = guessPosition(fields);
    const existingPlayer = byNameLower.get(nome.toLowerCase());
    if (existingPlayer) {
      upserts.push({ id: existingPlayer.id, team_id: teamId, name: nome, number: numRaw, position: pos });
      updated++;
    } else {
      upserts.push({ id: crypto.randomUUID(), team_id: teamId, name: nome, number: numRaw, position: pos });
      added++;
    }
  }

  const numCounts = new Map<string, number>();
  upserts.forEach((u) => {
    if (!u.number) return;
    numCounts.set(u.number, (numCounts.get(u.number) || 0) + 1);
  });
  const dupNums = [...numCounts.entries()].filter(([, count]) => count > 1).map(([num]) => num);

  return { upserts, added, updated, skipped, dupNums };
}
