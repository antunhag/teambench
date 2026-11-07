// RLS de club_members: auto-inserção só no clube acabado de criar (migração
// 0028). Corre em PGlite (Postgres embutido, sem rede, sem Supabase real —
// Princípio IV) com um papel `authenticated` e um auth.uid() simulado por GUC,
// para que a RLS seja de facto avaliada (ao contrário dos testes de
// integridade irmãos, que correm como dono das tabelas).
//
// O esquema espelha só o necessário de 0003_clubs_and_team_roles.sql: clubs,
// club_members, my_club_ids() e as policies de clubs/club_members, copiadas
// do ficheiro real. A policy antiga (club_members_insert_self) é recriada para
// demonstrar a falha antes de aplicar o ficheiro real da 0028. Qualquer
// migração futura que mexa em clubs/club_members/teams obriga a rever este
// esquema copiado à mão.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixSql = readFileSync(
  join(__dirname, "../../../supabase/migrations/0028_club_members_self_insert_only_for_new_club.sql"),
  "utf-8"
);

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ATACANTE = "00000000-0000-0000-0000-00000000000b";
const NOVO = "00000000-0000-0000-0000-00000000000c";
const CLUBE = "10000000-0000-0000-0000-000000000001";
const CLUBE_NOVO = "10000000-0000-0000-0000-000000000002";
const CLUBE_ORFAO = "10000000-0000-0000-0000-000000000003";
const EQUIPA_ORFA = "20000000-0000-0000-0000-000000000001";

const schemaSql = `
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated;

  create table clubs (
    id uuid primary key,
    name text not null,
    slug text unique not null
  );
  create table club_members (
    id uuid primary key default md5(random()::text)::uuid,
    club_id uuid not null references clubs(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    unique (club_id, user_id)
  );
  create table teams (
    id uuid primary key,
    club_id uuid references clubs(id) on delete cascade
  );
  alter table clubs enable row level security;
  alter table club_members enable row level security;
  alter table teams enable row level security;
  -- Como no Supabase: o papel tem todos os privilégios de tabela; quem decide é a RLS.
  grant all on clubs, club_members, teams to authenticated;

  create or replace function my_club_ids()
  returns setof uuid language sql security definer set search_path = public stable as $$
    select club_id from club_members where user_id = auth.uid();
  $$;
  grant execute on function my_club_ids() to authenticated;

  create policy clubs_select_member on clubs for select
    using (id in (select my_club_ids()));
  create policy clubs_insert_any_authenticated on clubs for insert
    with check (auth.uid() is not null);
  create policy club_members_select_same_club on club_members for select
    using (club_id in (select my_club_ids()));
  create policy club_members_insert_self on club_members for insert
    with check (user_id = auth.uid());

  insert into auth.users values ('${ADMIN}'), ('${ATACANTE}'), ('${NOVO}');
  insert into clubs values ('${CLUBE}', 'Clube', 'clube');
  insert into club_members (club_id, user_id) values ('${CLUBE}', '${ADMIN}');
  -- Clube órfão: tem uma equipa mas nenhum membro (backfill da 0003 ou Admin apagado).
  insert into clubs values ('${CLUBE_ORFAO}', 'Órfão', 'orfao');
  insert into teams values ('${EQUIPA_ORFA}', '${CLUBE_ORFAO}');
`;

async function como(db: PGlite, uid: string, sql: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role;");
  }
}

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(schemaSql);
});

describe("club_members — antes da 0028 (caracterização da falha)", () => {
  it("qualquer conta autenticada se inseria num clube alheio", async () => {
    await como(db, ATACANTE, `insert into club_members (club_id, user_id) values ('${CLUBE}', '${ATACANTE}')`);
    const r = await db.query<{ n: number }>(`select count(*)::int as n from club_members where club_id = '${CLUBE}'`);
    expect(r.rows[0].n).toBe(2);
  });
});

describe("club_members — com a 0028", () => {
  beforeEach(async () => {
    await db.exec(fixSql);
  });

  it("recusa a auto-inserção num clube que já tem membros", async () => {
    await expect(
      como(db, ATACANTE, `insert into club_members (club_id, user_id) values ('${CLUBE}', '${ATACANTE}')`)
    ).rejects.toThrow(/row-level security/);
  });

  it("o onboarding continua a funcionar: quem cria o clube torna-se o primeiro Admin", async () => {
    await como(db, NOVO, `insert into clubs (id, name, slug) values ('${CLUBE_NOVO}', 'Novo', 'novo')`);
    await como(db, NOVO, `insert into club_members (club_id, user_id) values ('${CLUBE_NOVO}', '${NOVO}')`);
    const r = await como(db, NOVO, `select id from clubs`);
    expect(r.rows).toEqual([{ id: CLUBE_NOVO }]);
  });

  it("depois do primeiro Admin, mais ninguém se auto-insere no clube novo", async () => {
    await como(db, NOVO, `insert into clubs (id, name, slug) values ('${CLUBE_NOVO}', 'Novo', 'novo')`);
    await como(db, NOVO, `insert into club_members (club_id, user_id) values ('${CLUBE_NOVO}', '${NOVO}')`);
    await expect(
      como(db, ATACANTE, `insert into club_members (club_id, user_id) values ('${CLUBE_NOVO}', '${ATACANTE}')`)
    ).rejects.toThrow(/row-level security/);
  });

  it("ninguém insere outra pessoa, nem num clube vazio", async () => {
    await como(db, NOVO, `insert into clubs (id, name, slug) values ('${CLUBE_NOVO}', 'Novo', 'novo')`);
    await expect(
      como(db, ATACANTE, `insert into club_members (club_id, user_id) values ('${CLUBE_NOVO}', '${NOVO}')`)
    ).rejects.toThrow(/row-level security/);
  });

  it("recusa reclamar um clube sem membros mas com equipas (órfão)", async () => {
    await expect(
      como(db, ATACANTE, `insert into club_members (club_id, user_id) values ('${CLUBE_ORFAO}', '${ATACANTE}')`)
    ).rejects.toThrow(/row-level security/);
  });

  it("sem sessão, nem num clube vazio", async () => {
    await como(db, NOVO, `insert into clubs (id, name, slug) values ('${CLUBE_NOVO}', 'Novo', 'novo')`);
    await expect(
      como(db, "", `insert into club_members (club_id, user_id) values ('${CLUBE_NOVO}', '${NOVO}')`)
    ).rejects.toThrow(/row-level security/);
  });

  it("UPDATE e DELETE em club_members não têm efeito (não há policy; a RLS filtra todas as linhas)", async () => {
    await como(db, ADMIN, `update club_members set club_id = '${CLUBE_ORFAO}' where user_id = '${ADMIN}'`);
    await como(db, ADMIN, `delete from club_members where user_id = '${ADMIN}'`);
    const r = await db.query<{ club_id: string }>(`select club_id from club_members where user_id = '${ADMIN}'`);
    expect(r.rows).toEqual([{ club_id: CLUBE }]);
  });

  it("é idempotente (aplicar duas vezes não falha)", async () => {
    await db.exec(fixSql);
  });
});
