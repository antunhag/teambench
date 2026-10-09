-- Corrige um bug real em `guard_denormalized_team_id()` (0023): combinar o
-- teste de `tg_table_name` e o acesso a um campo que só existe numa das 3
-- tabelas numa ÚNICA expressão booleana (`tg_table_name = 'X' and
-- new.campo_só_de_X ...`) NÃO protege contra o erro "record 'new' has no
-- field" quando a linha é de OUTRA tabela — o PL/pgSQL resolve o acesso ao
-- campo do record como parte da MESMA expressão SQL, independente do "and"
-- nunca chegar a avaliar esse lado em valor. Resultado real, reproduzido ao
-- vivo: ajustar a confiança de um atleta pela 2ª vez (upsert bate em
-- `ON CONFLICT DO UPDATE`, então `tg_op = 'UPDATE'`) numa linha de
-- `rotation_plan_weights` batia no ramo `elsif tg_table_name =
-- 'rotation_plan_stints' and (new.plan_id ...)` e falhava com "record 'new'
-- has no field 'plan_id'" — `rotation_plan_weights` nunca teve essa coluna.
-- A 1ª gravação (insert puro, `tg_op = 'INSERT'`) nunca entra nesse bloco,
-- por isso o bug só aparecia ao reajustar um peso já salvo, nunca no
-- primeiro ajuste — exatamente o sintoma relatado ("quando altero a
-- confiança, não salva").
--
-- Fix: aninhar o acesso ao campo específico de cada tabela DENTRO do ramo já
-- filtrado por `tg_table_name` (um `if` separado, nunca um `and` na mesma
-- expressão) — só avalia `new.plan_id`/`new.match_id` quando a linha É da
-- tabela certa, nunca como parte de uma expressão processada pra linhas de
-- outras tabelas. Mesma lógica de segurança da 0023, zero mudança de
-- comportamento esperado — só corrige o bug de resolução de campo.
--
-- `create or replace function` já propaga pros 3 triggers existentes (todos
-- referenciam a função pelo nome) — não precisa recriar nenhum trigger.

create or replace function guard_denormalized_team_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_team_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id then
      raise exception 'team_id não pode ser alterado depois de criado.';
    end if;
    if tg_table_name = 'player_aptitudes' then
      if new.player_id is distinct from old.player_id then
        raise exception 'player_id não pode ser alterado depois de criado.';
      end if;
    elsif tg_table_name = 'rotation_plan_stints' then
      if new.plan_id is distinct from old.plan_id or new.player_id is distinct from old.player_id then
        raise exception 'plan_id/player_id não podem ser alterados depois de criados.';
      end if;
    elsif tg_table_name = 'rotation_plan_weights' then
      if new.match_id is distinct from old.match_id or new.player_id is distinct from old.player_id then
        raise exception 'match_id/player_id não podem ser alterados depois de criados.';
      end if;
    end if;
  end if;

  if tg_table_name = 'player_aptitudes' then
    select team_id into expected_team_id from players where id = new.player_id;
  elsif tg_table_name = 'rotation_plan_stints' then
    select team_id into expected_team_id from rotation_plans where id = new.plan_id;
    if expected_team_id is distinct from new.team_id then
      raise exception 'team_id não corresponde à equipa do plano (plan_id).';
    end if;
    select team_id into expected_team_id from players where id = new.player_id;
  elsif tg_table_name = 'rotation_plan_weights' then
    select team_id into expected_team_id from matches where id = new.match_id;
    if expected_team_id is distinct from new.team_id then
      raise exception 'team_id não corresponde à equipa do jogo (match_id).';
    end if;
    select team_id into expected_team_id from players where id = new.player_id;
  end if;

  if expected_team_id is distinct from new.team_id then
    raise exception 'team_id não corresponde à equipa do atleta (player_id).';
  end if;

  return new;
end;
$$;
