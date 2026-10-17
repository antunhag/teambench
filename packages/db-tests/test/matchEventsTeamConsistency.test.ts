// Teste de CARACTERIZAÇÃO (não de correção): demonstra, em PGlite, sem rede e
// sem Supabase real, se o esquema atual de match_events aceita ou rejeita uma
// combinação inconsistente de team_id/match_id/player_id entre equipas
// diferentes. Hoje não existe, para match_events, nenhuma proteção
// equivalente à que supabase/migrations/0023_denormalized_team_id_guard.sql
// deu a player_aptitudes/rotation_plan_stints/rotation_plan_weights — o
// comentário da própria 0023 cita match_events como o padrão que a
// inspirou, mas o trigger nunca foi estendido a ela (confirmado por grep:
// "match_events" não ocorre em 0023 nem em 0024).
//
// Este ficheiro é de INTEGRIDADE, não de RLS: corre sem row level security,
// como a conexão dona das tabelas — a mesma estratégia já usada em
// matchEventsUpdateGuard.test.ts. Não afirma nada sobre o que uma policy de
// RLS deixaria ou não um papel `authenticated` real fazer (isso foi avaliado
// separadamente, por leitura das policies, na auditoria). Um teste que PASSE
// aqui confirmando aceitação de uma combinação inconsistente documenta uma
// LACUNA ATUAL — não significa que esse comportamento seja desejado.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const matchEventsUpdateGuardSql = readFileSync(
  join(__dirname, "../../../supabase/migrations/0026_match_events_update_guard.sql"),
  "utf-8"
);
const matchEventsTeamConsistencySql = readFileSync(
  join(__dirname, "../../../supabase/migrations/0027_match_events_team_consistency.sql"),
  "utf-8"
);

// Espelha as colunas REAIS de supabase/migrations/0001_init.sql relevantes
// para a relação team_id/match_id/player_id (players: linhas 65-74; matches:
// linhas 90-105; match_events: linhas 107-123) — mesmas FKs, mesma
// obrigatoriedade de team_id em cada tabela. Omite deliberadamente: RLS
// (0001:129-144+), team_members/auth, e colunas sem relação com esta
// pergunta (name/slug/plan/status de teams; format_id/opponent/match_date/
// etc. de matches; name/number/position/active de players) — nenhuma delas
// é tocada pela pergunta de consistência team_id<->match_id<->player_id, e
// nenhuma altera o resultado dos casos abaixo. Não omite nenhuma FK/
// constraint real das 4 tabelas envolvidas nesta pergunta. IDs explícitos
// (sem gen_random_uuid()) pelo mesmo motivo do teste irmão: evitar depender
// da extensão pgcrypto.
const schemaSql = `
  create table teams (id uuid primary key);

  create table matches (
    id uuid primary key,
    team_id uuid not null references teams(id) on delete cascade
  );

  create table players (
    id uuid primary key,
    team_id uuid not null references teams(id) on delete cascade
  );

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

async function setupDbPreFix(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(schemaSql);
  // Só a trigger de UPDATE (0026, ficheiro real) — ESTADO ANTERIOR a
  // 0027. Não há, e este setup não introduz, nenhuma trigger de INSERT nem
  // de consistência team_id<->match_id — é exatamente isso que está a ser
  // caracterizado abaixo. Esta secção documenta o esquema de ANTES da
  // correção — não é um requisito desejável, é a baseline que 0027 corrige.
  await db.exec(matchEventsUpdateGuardSql);
  return db;
}

async function setupDbPostFix(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(schemaSql);
  await db.exec(matchEventsUpdateGuardSql);
  // Migração real (ficheiro real via readFileSync, não reimplementada aqui):
  // adiciona a FK composta (match_id, team_id) -> matches(id, team_id) que
  // fecha a lacuna caracterizada na secção "ANTES" abaixo.
  await db.exec(matchEventsTeamConsistencySql);
  return db;
}

interface Fixture {
  db: PGlite;
  teamA: string;
  teamB: string;
  matchOfA: string;
  matchOfB: string;
  playerOfA: string;
  playerOfB: string;
}

async function seedTwoTeams(db: PGlite): Promise<Omit<Fixture, "db">> {
  const teamA = randomUUID();
  const teamB = randomUUID();
  const matchOfA = randomUUID();
  const matchOfB = randomUUID();
  const playerOfA = randomUUID();
  const playerOfB = randomUUID();

  await db.query("insert into teams (id) values ($1), ($2)", [teamA, teamB]);
  await db.query("insert into matches (id, team_id) values ($1, $2), ($3, $4)", [
    matchOfA,
    teamA,
    matchOfB,
    teamB,
  ]);
  await db.query("insert into players (id, team_id) values ($1, $2), ($3, $4)", [
    playerOfA,
    teamA,
    playerOfB,
    teamB,
  ]);

  return { teamA, teamB, matchOfA, matchOfB, playerOfA, playerOfB };
}

async function insertEvent(
  db: PGlite,
  opts: { matchId: string; teamId: string; playerId: string | null }
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into match_events (id, client_event_id, match_id, team_id, type, player_id, payload, ms, min, sec, period)
     values ($1, $2, $3, $4, 'golo', $5, '{}'::jsonb, 100000, 1, 40, 1)`,
    [id, randomUUID(), opts.matchId, opts.teamId, opts.playerId]
  );
  return id;
}

describe("match_events — consistência team_id/match_id/player_id entre equipas — ANTES da correção (sem migração 0027 aplicada; documenta o esquema anterior, não um requisito desejável)", () => {
  let fx: Fixture;

  beforeEach(async () => {
    const db = await setupDbPreFix();
    const seeded = await seedTwoTeams(db);
    fx = { db, ...seeded };
  });

  describe("A. combinação legítima (mesma equipa)", () => {
    it("aceita team_id e match_id da MESMA equipa", async () => {
      const id = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: fx.playerOfA });

      const { rows } = await fx.db.query<{ team_id: string; match_id: string; player_id: string }>(
        "select team_id, match_id, player_id from match_events where id = $1",
        [id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].team_id).toBe(fx.teamA);
      expect(rows[0].match_id).toBe(fx.matchOfA);
      expect(rows[0].player_id).toBe(fx.playerOfA);
    });
  });

  describe("B. INSERT com team_id/match_id de equipas diferentes — lacuna atual", () => {
    it("CARACTERIZAÇÃO: o esquema atual ACEITA um INSERT com team_id da equipa A e match_id da equipa B (não existe nenhuma trigger de INSERT em match_events)", async () => {
      // Não há, hoje, nenhum "before insert" em match_events (ao contrário de
      // player_aptitudes/rotation_plan_stints/rotation_plan_weights, que têm
      // guard_denormalized_team_id desde 0023/0024 também em before insert).
      // Este teste documenta o comportamento ATUAL — não afirma que ele é
      // desejado.
      const id = await insertEvent(fx.db, { matchId: fx.matchOfB, teamId: fx.teamA, playerId: null });

      const { rows } = await fx.db.query<{ team_id: string; match_id: string }>(
        "select team_id, match_id from match_events where id = $1",
        [id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].team_id).toBe(fx.teamA);
      expect(rows[0].match_id).toBe(fx.matchOfB); // inconsistente: team_id=A, mas aponta pro jogo de B
    });
  });

  describe("C. UPDATE de uma linha legítima para uma combinação inconsistente", () => {
    it("REJEITA a mudança de match_id para outra equipa SEM correcao:true — bloqueio vem do guard genérico 0026, não de uma proteção dedicada a team_id/match_id (que não existe)", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query("update match_events set match_id = $2 where id = $1", [eventId, fx.matchOfB])
      ).rejects.toThrow(/match_events: UPDATE que muda dado precisa de payload\.correcao/);
      // A mensagem confirma que a rejeição vem do guard 0026 (genérico:
      // "qualquer mudança de dado exige correcao:true") — não existe nenhuma
      // mensagem nem trigger específica de consistência team_id<->match_id.

      const { rows } = await fx.db.query<{ match_id: string }>(
        "select match_id from match_events where id = $1",
        [eventId]
      );
      expect(rows[0].match_id).toBe(fx.matchOfA); // a rejeição realmente impediu a escrita
    });

    it("CARACTERIZAÇÃO: com correcao:true (caminho de correção legítimo), a mesma mudança para outra equipa é ACEITE sem nenhuma validação adicional de consistência", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query(`update match_events set match_id = $2, payload = $3::jsonb where id = $1`, [
          eventId,
          fx.matchOfB,
          JSON.stringify({ correcao: true }),
        ])
      ).resolves.toBeDefined();

      const { rows } = await fx.db.query<{ match_id: string; team_id: string }>(
        "select match_id, team_id from match_events where id = $1",
        [eventId]
      );
      // team_id continua "A", match_id passou a apontar pro jogo de "B" — o
      // guard 0026 só exigiu a flag, não validou o valor novo de match_id.
      expect(rows[0].team_id).toBe(fx.teamA);
      expect(rows[0].match_id).toBe(fx.matchOfB);
    });
  });

  describe("D. player_id de uma equipa diferente — regra de domínio não determinada", () => {
    // Não encontrei, em apps/web/src/team/usePlayers.ts nem em
    // rosterImport.ts, nenhuma funcionalidade de transferir um atleta entre
    // equipas — todo UPDATE em `players` encontrado na app só altera number/
    // name/position/active/availability_status/availability_note, nunca
    // team_id (grep confirmado). Isso é evidência de que a app NÃO expõe
    // transferência hoje, mas não é uma regra explícita de domínio
    // encontrada numa migration que proíba o dado em si. Fica PENDENTE se um
    // player_id "de outra equipa" num match_event deveria ser proibido por
    // regra de negócio, ou é só consequência não intencional da ausência de
    // proteção — não invento essa regra aqui.
    it("CARACTERIZAÇÃO: o esquema atual ACEITA team_id/match_id da mesma equipa mas player_id de uma equipa diferente (regra de negócio pendente de confirmação — ver comentário acima)", async () => {
      const id = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: fx.playerOfB });

      const { rows } = await fx.db.query<{ player_id: string }>(
        "select player_id from match_events where id = $1",
        [id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].player_id).toBe(fx.playerOfB);
    });
  });

  describe("E. player_id nulo — caminho legítimo existente", () => {
    it("aceita player_id nulo numa combinação team_id/match_id legítima (ex.: evento sem jogador associado)", async () => {
      const id = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      const { rows } = await fx.db.query<{ player_id: string | null }>(
        "select player_id from match_events where id = $1",
        [id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].player_id).toBeNull();
    });
  });
});

describe("match_events — consistência team_id/match_id entre equipas — DEPOIS da correção (migração 0027 aplicada, carregada do ficheiro real)", () => {
  // Teste de INTEGRIDADE, não de RLS: corre sem row level security, como a
  // conexão dona das tabelas — "sujeito às permissões" (regra 1 autorizada)
  // refere-se ao que as policies matches_update_coach/match_events_write_coach
  // fariam num ambiente real; não é exercitado aqui. player_id/players.team_id
  // continua FORA do âmbito desta migração — não é tocado nesta secção.
  let fx: Fixture;

  beforeEach(async () => {
    const db = await setupDbPostFix();
    const seeded = await seedTwoTeams(db);
    fx = { db, ...seeded };
  });

  describe("F. INSERT — mesma lacuna da secção anterior, agora corrigida", () => {
    it("REJEITA um INSERT com team_id da equipa A e match_id da equipa B — a FK composta pega o que nenhuma trigger de INSERT pegava antes", async () => {
      await expect(
        insertEvent(fx.db, { matchId: fx.matchOfB, teamId: fx.teamA, playerId: null })
      ).rejects.toThrow(/match_events_match_team_fk/);

      const { rows } = await fx.db.query("select 1 from match_events where team_id = $1", [fx.teamA]);
      expect(rows).toHaveLength(0); // nada foi escrito — não há linha parcial
    });

    it("continua a aceitar um INSERT legítimo (team_id e match_id da mesma equipa) — sem regressão", async () => {
      const id = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: fx.playerOfA });
      const { rows } = await fx.db.query<{ team_id: string }>("select team_id from match_events where id = $1", [
        id,
      ]);
      expect(rows[0].team_id).toBe(fx.teamA);
    });

    it("continua a aceitar player_id nulo numa combinação legítima — sem regressão", async () => {
      const id = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });
      const { rows } = await fx.db.query<{ player_id: string | null }>(
        "select player_id from match_events where id = $1",
        [id]
      );
      expect(rows[0].player_id).toBeNull();
    });
  });

  describe("G. UPDATE em match_events — a FK fecha o que 0026 sozinho deixava passar com correcao:true", () => {
    it("continua a REJEITAR, por 0026, uma mudança de match_id SEM correcao:true (mesma causa de sempre, sem regressão)", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });
      await expect(
        fx.db.query("update match_events set match_id = $2 where id = $1", [eventId, fx.matchOfB])
      ).rejects.toThrow(/match_events: UPDATE que muda dado precisa de payload\.correcao/);
    });

    it("REJEITA (agora pela FK, não por 0026) um UPDATE de match_id para outra equipa COM correcao:true — o gap que a caracterização anterior documentou", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query(`update match_events set match_id = $2, payload = $3::jsonb where id = $1`, [
          eventId,
          fx.matchOfB,
          JSON.stringify({ correcao: true }),
        ])
      ).rejects.toThrow(/match_events_match_team_fk/);

      // Ausência de alterações parciais: nenhum campo mudou, incluindo os
      // que não faziam parte da condição da FK.
      const { rows } = await fx.db.query<{ match_id: string; team_id: string }>(
        "select match_id, team_id from match_events where id = $1",
        [eventId]
      );
      expect(rows[0].match_id).toBe(fx.matchOfA);
      expect(rows[0].team_id).toBe(fx.teamA);
    });

    it("REJEITA um UPDATE isolado de team_id (sem mudar match_id) para uma equipa que não bate com o jogo, mesmo com correcao:true", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query(`update match_events set team_id = $2, payload = $3::jsonb where id = $1`, [
          eventId,
          fx.teamB,
          JSON.stringify({ correcao: true }),
        ])
      ).rejects.toThrow(/match_events_match_team_fk/);
    });

    it("continua a aceitar uma correção legítima com correcao:true que NÃO muda a equipa/jogo — sem regressão", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query(`update match_events set ms = 200000, payload = $2::jsonb where id = $1`, [
          eventId,
          JSON.stringify({ correcao: true }),
        ])
      ).resolves.toBeDefined();

      const { rows } = await fx.db.query<{ ms: number }>("select ms from match_events where id = $1", [eventId]);
      expect(rows[0].ms).toBe(200000);
    });

    it("continua a aceitar um reenvio idêntico (idempotente) — interação com 0026 sem regressão", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query(
          "update match_events set match_id = $2, team_id = $3 where id = $1",
          [eventId, fx.matchOfA, fx.teamA]
        )
      ).resolves.toBeDefined();
    });
  });

  describe("H. UPDATE em matches.team_id — proteger também o sentido inverso (decisão de produto aprovada para este lote)", () => {
    it("PERMITE mover um jogo sem eventos para outra equipa", async () => {
      await expect(
        fx.db.query("update matches set team_id = $2 where id = $1", [fx.matchOfB, fx.teamA])
      ).resolves.toBeDefined();

      const { rows } = await fx.db.query<{ team_id: string }>("select team_id from matches where id = $1", [
        fx.matchOfB,
      ]);
      expect(rows[0].team_id).toBe(fx.teamA);
    });

    it("REJEITA mover um jogo COM eventos para outra equipa — os eventos nunca ficam associados à equipa anterior porque o jogo simplesmente não se move", async () => {
      const eventId = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query("update matches set team_id = $2 where id = $1", [fx.matchOfA, fx.teamB])
      ).rejects.toThrow(/match_events_match_team_fk/);

      // Nem o jogo nem o evento mudaram — sem transferência automática,
      // sem dado histórico alterado.
      const matchRows = await fx.db.query<{ team_id: string }>("select team_id from matches where id = $1", [
        fx.matchOfA,
      ]);
      expect(matchRows.rows[0].team_id).toBe(fx.teamA);
      const eventRows = await fx.db.query<{ team_id: string }>(
        "select team_id from match_events where id = $1",
        [eventId]
      );
      expect(eventRows.rows[0].team_id).toBe(fx.teamA);
    });

    it("PERMITE 'mudar' a equipa de um jogo com eventos para a MESMA equipa (no-op) — não é uma mudança real", async () => {
      await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: null });

      await expect(
        fx.db.query("update matches set team_id = $2 where id = $1", [fx.matchOfA, fx.teamA])
      ).resolves.toBeDefined();
    });
  });

  describe("I. player_id de outra equipa — continua como caracterização, NÃO foi corrigido (fora do âmbito deste lote)", () => {
    it("CARACTERIZAÇÃO (inalterada): mesmo com 0027 aplicada, player_id de uma equipa diferente continua a ser aceite — regra de negócio pendente, não validada por esta migração", async () => {
      const id = await insertEvent(fx.db, { matchId: fx.matchOfA, teamId: fx.teamA, playerId: fx.playerOfB });
      const { rows } = await fx.db.query<{ player_id: string }>(
        "select player_id from match_events where id = $1",
        [id]
      );
      expect(rows[0].player_id).toBe(fx.playerOfB);
    });
  });
});

// Todos os resultados abaixo foram observados executando o cenário num
// script PGlite isolado antes de escrever as asserções (não foram
// adivinhados) — ver comentário "LIMITE DESTA PROTEÇÃO CONFIRMADO POR TESTE"
// em 0027_match_events_team_consistency.sql, escrito a partir destes mesmos
// resultados.
describe("match_events — linha legada inconsistente criada ANTES de 0027 existir (pior caso: dados antigos nunca validados)", () => {
  // Ordem deliberada: cria o schema + 0026 (sem 0027), insere uma linha
  // INCONSISTENTE (como seria possível em produção antes desta migration
  // existir), só DEPOIS aplica 0027 a partir do ficheiro real — espelha
  // exatamente a sequência histórica real (dado antigo já lá, migration
  // chega depois).
  let db: PGlite;
  let teamA: string;
  let teamB: string;
  let matchOfA: string; // matches.team_id = teamA
  let matchOfB: string; // matches.team_id = teamB
  let legacyEventId: string; // já existia, com team_id=teamB apontando pro jogo de A — inconsistente desde a criação

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(schemaSql);
    await db.exec(matchEventsUpdateGuardSql);

    teamA = randomUUID();
    teamB = randomUUID();
    matchOfA = randomUUID();
    matchOfB = randomUUID();
    await db.query("insert into teams (id) values ($1), ($2)", [teamA, teamB]);
    await db.query("insert into matches (id, team_id) values ($1, $2), ($3, $4)", [
      matchOfA,
      teamA,
      matchOfB,
      teamB,
    ]);

    // A. Linha inconsistente criada ANTES de 0027 existir (0027 ainda não foi
    // executado nesta beforeEach) — o único evento do jogo de A tem
    // team_id=B.
    legacyEventId = await insertEvent(db, { matchId: matchOfA, teamId: teamB, playerId: null });

    // B. Aplica o ficheiro real de 0027 agora, com a linha inconsistente já
    // presente.
    await db.exec(matchEventsTeamConsistencySql);
  });

  it("B/C. aplicar 0027 com a linha já inconsistente SUCEDE, e a linha antiga continua presente e inalterada", async () => {
    // Observado: ADD CONSTRAINT ... NOT VALID não escaneia match_events, logo
    // não rejeita a migration mesmo com a linha má já lá.
    const { rows } = await db.query<{ team_id: string; match_id: string; ms: number }>(
      "select team_id, match_id, ms from match_events where id = $1",
      [legacyEventId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].team_id).toBe(teamB); // continua inconsistente — não foi tocada
    expect(rows[0].match_id).toBe(matchOfA);
  });

  it("D. a constraint fica registada como NÃO validada no catálogo real (pg_constraint.convalidated = false)", async () => {
    const { rows } = await db.query<{ conname: string; convalidated: boolean }>(
      "select conname, convalidated from pg_constraint where conname = 'match_events_match_team_fk'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].convalidated).toBe(false);
  });

  it("E. VALIDATE CONSTRAINT (só neste PGlite de teste, descartável) é REJEITADO pela linha legada inconsistente", async () => {
    await expect(
      db.query("alter table match_events validate constraint match_events_match_team_fk")
    ).rejects.toThrow(/match_events_match_team_fk/);
  });

  it("F. uma NOVA inserção inconsistente continua a ser rejeitada, mesmo coexistindo com a linha legada não validada", async () => {
    await expect(insertEvent(db, { matchId: matchOfB, teamId: teamA, playerId: null })).rejects.toThrow(
      /match_events_match_team_fk/
    );
  });

  it("CARACTERIZAÇÃO: um UPDATE de campo fora da FK (ms), com correcao:true, na linha legada inconsistente SUCEDE — match_id/team_id não mudam, logo a FK não tem novidade para verificar", async () => {
    // Observado por execução direta (não assumido): como esta UPDATE não
    // altera match_id nem team_id, os valores "novos" dessas colunas são
    // idênticos aos antigos (já inconsistentes) — a FK não encontra nada de
    // diferente para rejeitar. 0026 deixa passar por causa de correcao:true.
    // Resultado prático: uma correção legítima a um campo não relacionado
    // continua a funcionar numa linha legada, sem exigir resolver a
    // inconsistência primeiro.
    await expect(
      db.query(`update match_events set ms = 777777, payload = $2::jsonb where id = $1`, [
        legacyEventId,
        JSON.stringify({ correcao: true }),
      ])
    ).resolves.toBeDefined();

    const { rows } = await db.query<{ ms: number; team_id: string }>(
      "select ms, team_id from match_events where id = $1",
      [legacyEventId]
    );
    expect(rows[0].ms).toBe(777777);
    expect(rows[0].team_id).toBe(teamB); // inconsistência pré-existente continua lá, intocada
  });

  it("CARACTERIZAÇÃO (limite da proteção): mover matches.team_id de um jogo cujo ÚNICO evento é o legado inconsistente é ACEITE — a FK não vê a linha legada como uma referência à chave atual do jogo", async () => {
    // Observado por execução direta (não assumido): o evento legado tem
    // team_id=teamB, mas matchOfA.team_id é teamA — nunca bateram. O
    // mecanismo de restrição da FK, ao tentar mudar matches.team_id de
    // matchOfA, procura linhas-filhas com (match_id, team_id) = (matchOfA,
    // teamA) [a chave ANTIGA do jogo] — a linha legada não tem essa
    // combinação (tem team_id=teamB), logo não é encontrada, e a mudança de
    // equipa do jogo É PERMITIDA, apesar de existir um evento associado.
    // Este é exatamente o limite documentado em 0027 — a proteção só vale
    // para eventos já consistentes.
    await expect(
      db.query("update matches set team_id = $2 where id = $1", [matchOfA, teamB])
    ).resolves.toBeDefined();

    const { rows } = await db.query<{ team_id: string }>("select team_id from matches where id = $1", [
      matchOfA,
    ]);
    expect(rows[0].team_id).toBe(teamB); // o jogo moveu-se, apesar do evento legado associado
  });

  it("eliminar o jogo com o evento legado inconsistente associado continua a apagar o evento em cascata (via a FK simples de match_id já existente desde 0001, independente de 0027 estar ou não validada)", async () => {
    await db.query("delete from matches where id = $1", [matchOfA]);

    const { rows } = await db.query("select 1 from match_events where id = $1", [legacyEventId]);
    expect(rows).toHaveLength(0); // apagado em cascata, mesmo nunca tendo sido validado pela FK nova
  });
});
