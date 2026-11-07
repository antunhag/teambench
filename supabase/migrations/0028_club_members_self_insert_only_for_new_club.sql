-- Fecha a auto-inserção em club_members de QUALQUER clube (auditoria de
-- segurança, 2026-11-07, achado C1).
--
-- Até aqui, club_members_insert_self (0003) só exigia user_id = auth.uid().
-- Qualquer conta autenticada que soubesse o club_id (visível a qualquer membro
-- de uma equipa em teams.club_id, ou a um ex-membro) podia inserir-se como
-- Admin do Clube e, pela policy de team_members da 0007 (ramo "admin do
-- clube"), tornar-se team_admin de todas as equipas desse clube. É a mesma
-- classe do incidente fechado na 0007, um nível acima.
--
-- O único uso legítimo do auto-insert é o onboarding (CreateClub.tsx): quem
-- acabou de criar o clube torna-se o seu primeiro Admin. A nova policy só
-- permite isso: inserir-se a si próprio num clube que ainda não tem membros
-- NEM equipas. O id do clube novo é gerado no navegador (UUID aleatório), por
-- isso ninguém o conhece antes do criador. "Sem equipas" fecha o caso de um
-- clube que fica sem Admin mas continua com equipas (backfill da 0003 numa
-- equipa sem team_admin, ou conta do único Admin apagada — on delete cascade):
-- sem isso, qualquer membro de uma dessas equipas, que vê teams.club_id, podia
-- reclamá-lo. A app não muda (o insert é o mesmo), e a ordem entre aplicar
-- esta migração e publicar a app é indiferente.
--
-- club_is_new é security definer porque, dentro da policy, a RLS de
-- club_members e de teams esconderia membros e equipas de um clube alheio e o
-- "ainda vazio" daria sempre verdadeiro — a falha ficaria aberta. Nomes
-- qualificados e pg_temp no fim do search_path: uma tabela temporária com o
-- mesmo nome não pode enganar a função.
--
-- Revisto pelo security-auditor em 2026-11-07 (aprovado com ressalvas, todas
-- incorporadas aqui). Depois de aplicar: o dono do projeto deve rever no painel
-- se club_members tem linhas inesperadas (ver docs/SECURITY.md, "Auto-inserção
-- em clube"); a 0028 impede intrusões novas, não remove as que já existam.

drop function if exists club_has_members(uuid);
create or replace function club_is_new(p_club_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select not exists (select 1 from public.club_members m where m.club_id = p_club_id)
     and not exists (select 1 from public.teams t where t.club_id = p_club_id);
$$;
revoke execute on function club_is_new(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function club_is_new(uuid) from anon';
  end if;
end $$;
grant execute on function club_is_new(uuid) to authenticated;

drop policy if exists club_members_insert_self on club_members;
drop policy if exists club_members_insert_first_admin on club_members;
create policy club_members_insert_first_admin on club_members for insert
  with check (user_id = auth.uid() and club_is_new(club_id));
