# Auditoria técnica: segurança e arquitetura (2026-11-07)

Este documento regista uma sessão de trabalho e não é uma descrição viva do sistema. Esse papel
continua a ser de `docs/ARCHITECTURE.md` e `docs/SECURITY.md`.

**Como foi feita:**
- Dois revisores só de leitura: o `security-auditor` (migrations 0001–0027, RLS, código cliente
  que escreve no Supabase, segredos) e o `architect-reviewer` (motor, sincronização, componentes,
  testes, cumprimento da constituição).
- A sessão principal confirmou cada achado no código antes de agir.
- Nenhum agente leu `.env`, tocou na rede ou falou com um Supabase real.
- O que está aplicado no Supabase de produção **não se vê a partir do repositório**.

## Resumo

| ID | Gravidade | Estado | Achado |
|---|---|---|---|
| S-C1 | Crítico | **Corrigido (0028 aplicada pelo dono em 2026-11-07)** | Qualquer conta autenticada podia inserir-se em `club_members` de qualquer clube, e daí tornar-se `team_admin` de todas as equipas desse clube |
| S-H1 | Alto (condicional) | **Não se aplica**: "Confirm email" ligado (confirmado pelo dono em 2026-11-07) | Convites aceites com email não confirmado, se o Auth permitir registo sem confirmação |
| S-M1 | Médio | **Corrigido** | Uma anulação inserida à mão na API tirava um golo (ou qualquer evento) do placar |
| S-M2 | Médio | Proposta | A coluna `type` e `payload.type` podem divergir, o que esconde a linha do editor de registo |
| S-M3 | Médio | Decisão de produto | `correcao:true` é declarado pelo cliente; a correção apaga o valor antigo (sem histórico) |
| S-L1 | Baixo | Proposta | A guarda 0026 não protege `id` nem `client_event_id` |
| S-L2 | Baixo | Proposta | `rotation_plans` sem FK composta: outra equipa pode bloquear o plano de um jogo |
| A-1 | Alto | **Corrigido** | Jogo reaberto a meio e retomado ("Iniciar Parte N"): perdia-se o tempo entre o 1º apito e a retoma |
| A-2 | Alto | **Parcialmente corrigido** | Três reconstruções de "quem está em quadra" com regras diferentes (replay, timeline, report) |
| A-3 | Alto | Proposta (`/speckit-specify`) | Dois aparelhos da mesma conta escrevem o mesmo jogo sem aviso |
| A-4 / S-L3 | Alto | Proposta | Um item recusado bloqueia toda a fila de sincronização, sem aviso |
| A-5 | Alto (hipótese) | Por verificar no navegador | Sem rede no arranque: plantel vazio e formato de reserva (pode terminar o jogo cedo demais) |
| A-M1 | Médio | Proposta | "Desfazer" depois de sincronizar: o servidor mantém o evento; regras diferentes entre "Jogo ao vivo" e Consola |
| A-M2 | Médio | Proposta | O Resumo junta servidor e local sem o filtro de pendentes |
| A-M5 | Médio | **Corrigido** | Os testes de `apps/web` não corriam no `npm test` nem nos portões |
| A-M6 | Médio (hipótese) | Proposta | O estado local do jogo não é separado por conta (tablet partilhado) |
| A-B4 | Baixo | **Corrigido** | ARCHITECTURE, CLAUDE.md e README desatualizados |
| P-V | Médio | **Corrigido** | Mensagens técnicas do Supabase mostradas cruas ao utilizador (Princípio V) |

## O que foi feito nesta sessão

- **S-C1:** migração `supabase/migrations/0028_club_members_self_insert_only_for_new_club.sql`.
  - O auto-insert só é aceite num clube ainda sem membros nem equipas (o onboarding). A
    verificação é feita por `club_is_new()`, com `security definer`.
  - A app não muda, e a ordem entre aplicar a migração e publicar a app é indiferente.
  - Teste com RLS real (papel `authenticated`): `packages/db-tests/test/clubMembersSelfInsert.test.ts`.
  - Passou por uma segunda revisão do `security-auditor` (ver a secção seguinte).
  - Aplicada em produção pelo dono do projeto em 2026-11-07.
- **S-M1:** `eventosEfetivos` (em `annul.ts`) só aplica uma anulação a um tipo anulável ou a outra
  anulação. Teste em `annul.test.ts`.
- **A-1:** `resumeOrStart` e `replayEvents` só iniciam a contagem de quem ainda não está a contar.
  Teste de dois apitos na mesma parte em `replay.test.ts`.
- **A-2 (parte):** a Timeline segue as regras do replay em três casos:
  - entradas repetidas não reiniciam a contagem;
  - um vermelho durante um pedido de tempo tira o jogador da quadra;
  - a ordenação é por ms e depois por ts.

  Os testes estão em `timeline.test.ts`. A função única de intervalos proposta pelo revisor fica
  para depois.
- **A-M5:** o `npm test` da raiz passou a correr também `apps/web`, e a constituição 1.3.0 incluiu-o
  nos portões.
- **P-V:** `traduzirErro` e `textoDeErro` (`apps/web/src/errorMessage.ts`, com testes) traduzem as
  mensagens de erro em todas as telas que as mostravam cruas.

Os testes novos falham sem as correções e passam com elas.

## Revisão da 0028 pelo `security-auditor`

Veredicto: **aprovado com ressalvas**, todas incorporadas na versão final da 0028:
- clube órfão (sem membros mas com equipas) reclamável → a condição passou a ser "sem membros
  **nem equipas**" (`club_is_new`);
- `search_path = public, pg_temp` e nomes qualificados; EXECUTE retirado a `anon`;
- testes acrescentados: clube órfão, sem sessão, UPDATE/DELETE com `grant all` (como no
  Supabase) sem efeito;
- `docs/SECURITY.md` com a secção "Auto-inserção em clube".

Ficou fora, de propósito: policy de DELETE em `club_members` (precisa de desenho próprio —
último admin, registo — e de nova revisão). Até lá, remover um intruso é pelo painel.

## O que fica para ti (decisões e verificações que não posso fazer)

1. **Aplicar a 0028 no Supabase** e depois rever, no painel, se `club_members`, `team_members` e
   `team_access_log` têm linhas inesperadas. Uma intrusão anterior não se vê a partir do código.
2. **Ver no painel (Auth → Providers → Email) se "Confirm email" está ligado** (S-H1). Se estiver,
   S-H1 não se aplica. Se não estiver, é preciso uma migração para exigir o email confirmado nos
   convites.
3. **Abrir a app sem rede**, depois de a ter aberto com rede, e ver se o plantel e o formato do jogo
   aparecem (A-5).
4. Decidir sobre S-M3 (histórico das correções), A-3 (aviso de escrita noutro aparelho) e A-M1
   ("Desfazer" depois de sincronizar). Mexem no significado dos eventos ou na sincronização, por
   isso passam por `/speckit-specify`.

## Propostas por ordem de retorno

1. A-4: no envio, quando o lote é recusado, voltar a tentar item a item, pôr em quarentena só o
   item recusado e mostrar "N lances recusados" numa frase simples. Nunca descartar nada.
2. A-5: guardar localmente o plantel e o formato do jogo por equipa, e não terminar uma parte com o
   formato de reserva sem o dizer.
3. A-2: uma função pura de intervalos em quadra no motor, usada pelo replay, pela Timeline e pelo
   Resumo, mais um teste de equivalência com o caminho ao vivo.
4. S-M2, S-L1 e S-L2: uma migração `not valid` com o CHECK `type = payload->>'type'`, a proteção de
   `id`/`client_event_id` na 0026 e a FK composta em `rotation_plans`. Exige o `security-auditor`.
5. A-M2: o Resumo passa a usar `juntarComServidor` com o mesmo cálculo de pendentes.
6. A-M6: as chaves locais do jogo passam a incluir a conta.
7. Desempenho (baixo): `useMemo` nos contadores da Consola e no Resumo aberto, que hoje são
   recalculados a cada segundo.
