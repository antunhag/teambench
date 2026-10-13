// Testa a trigger match_events_update_guard (supabase/migrations/0026) contra
// um Postgres totalmente local e embutido (PGlite — sem Docker, sem servidor,
// sem rede nenhuma) — nunca o Supabase real, nem local nem remoto (ver
// Princípio IV da constituição, emendado pra permitir exatamente isto).
//
// Carrega o ARQUIVO REAL da migração 0026 (fs.readFileSync, não uma cópia
// retranscrita) contra um esquema mínimo de match_events — mesmas colunas de
// supabase/migrations/0001_init.sql, sem o resto do schema (teams/matches/
// players reais, RLS, auth) que a trigger não usa. Se 0026 for editada no
// futuro, este teste passa a testar o arquivo editado automaticamente.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  join(__dirname, "../../../supabase/migrations/0026_match_events_update_guard.sql"),
  "utf-8"
);

// Espelha supabase/migrations/0001_init.sql's match_events (colunas idênticas,
// sem gen_random_uuid() — os testes fornecem id/client_event_id explícitos,
// evitando depender da extensão pgcrypto) + stubs mínimos das 3 tabelas que
// ela referencia por FK (teams/matches/players), só pra satisfazer a
// constraint — nenhuma delas tem RLS/colunas extra, porque a trigger nunca
// olha pra elas.
const schemaSql = `
  create table teams (id uuid primary key);
  create table matches (id uuid primary key);
  create table players (id uuid primary key);

  create table match_events (
    id uuid primary key,
    client_event_id uuid not null unique,
    match_id uuid not null references matches(id) on delete cascade,
    team_id uuid not null references teams(id) on delete cascade,
    type text not null,
    player_id uuid references players(id),
    payload jsonb not null default '{}',
    ms bigint,
    min int,
    sec int,
    period int,
    created_at timestamptz not null default now(),
    synced_at timestamptz not null default now()
  );
`;

async function setupDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(schemaSql);
  await db.exec(migrationSql);
  return db;
}

describe("match_events_update_guard (migração 0026)", () => {
  let db: PGlite;
  let matchId: string;
  let teamId: string;
  let eventId: string;

  beforeEach(async () => {
    db = await setupDb();
    matchId = randomUUID();
    teamId = randomUUID();
    eventId = randomUUID();
    await db.query("insert into matches (id) values ($1)", [matchId]);
    await db.query("insert into teams (id) values ($1)", [teamId]);
    await db.query(
      `insert into match_events (id, client_event_id, match_id, team_id, type, player_id, payload, ms, min, sec, period)
       values ($1, $2, $3, $4, 'substituicao', null, $5::jsonb, 100000, 1, 40, 1)`,
      [eventId, randomUUID(), matchId, teamId, JSON.stringify({ outId: null, label: "entra" })]
    );
  });

  it("permite um reenvio idêntico (resync idempotente de verdade)", async () => {
    await expect(
      db.query(
        `update match_events set ms = 100000, min = 1, sec = 40, period = 1, player_id = null, payload = $2::jsonb where id = $1`,
        [eventId, JSON.stringify({ outId: null, label: "entra" })]
      )
    ).resolves.toBeDefined();
  });

  it("permite o mesmo payload com as chaves em outra ordem (jsonb ignora ordem — não é 'mudança')", async () => {
    // Mesmo conteúdo do insert original, só com as chaves na ordem inversa.
    await expect(
      db.query(`update match_events set payload = $2::jsonb where id = $1`, [
        eventId,
        JSON.stringify({ label: "entra", outId: null }),
      ])
    ).resolves.toBeDefined();
  });

  it("permite uma correção de verdade quando o payload traz correcao: true", async () => {
    await expect(
      db.query(`update match_events set ms = 200000, payload = $2::jsonb where id = $1`, [
        eventId,
        JSON.stringify({ outId: null, correcao: true }),
      ])
    ).resolves.toBeDefined();
    const { rows } = await db.query<{ ms: number }>("select ms from match_events where id = $1", [eventId]);
    expect(rows[0].ms).toBe(200000);
  });

  it("permite marcar correcao: true mesmo sem mais nada mudar (autodeclaração trivial)", async () => {
    await expect(
      db.query(`update match_events set payload = $2::jsonb where id = $1`, [
        eventId,
        JSON.stringify({ outId: null, correcao: true }),
      ])
    ).resolves.toBeDefined();
  });

  it("REJEITA um UPDATE que muda dado (ms) sem a flag correcao — o achado real que esta trigger fecha", async () => {
    await expect(db.query(`update match_events set ms = 999999 where id = $1`, [eventId])).rejects.toThrow(
      /match_events: UPDATE que muda dado precisa de payload\.correcao/
    );
    // Garante que a rejeição realmente impediu a escrita, não só lançou e seguiu.
    const { rows } = await db.query<{ ms: number }>("select ms from match_events where id = $1", [eventId]);
    expect(rows[0].ms).toBe(100000);
  });

  it("REJEITA mudar player_id sem a flag, mesmo que o resto fique igual", async () => {
    const otherPlayer = randomUUID();
    await db.query("insert into players (id) values ($1)", [otherPlayer]);
    await expect(
      db.query(`update match_events set player_id = $2 where id = $1`, [eventId, otherPlayer])
    ).rejects.toThrow(/match_events: UPDATE que muda dado precisa de payload\.correcao/);
  });

  it("REJEITA um payload com correcao: false (não vale como autodeclaração)", async () => {
    await expect(
      db.query(`update match_events set ms = 999999, payload = $2::jsonb where id = $1`, [
        eventId,
        JSON.stringify({ outId: null, correcao: false }),
      ])
    ).rejects.toThrow(/match_events: UPDATE que muda dado precisa de payload\.correcao/);
  });
});
