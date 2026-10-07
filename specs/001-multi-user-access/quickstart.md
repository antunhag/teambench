# Quickstart: validar Acesso Multiusuário Robusto

Guia de validação de ponta a ponta — não é a lista de tarefas de implementação (isso
é o `tasks.md`, gerado por `/speckit-tasks`), é como confirmar que cada User Story da
spec funciona de verdade depois de implementada.

## Pré-requisitos

- Migração `0016_multi_user_access.sql` aplicada (SQL Editor do Supabase, mesmo
  processo das migrações anteriores).
- Build local a passar: `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`.
- **Nunca testar contra o jogo real do clube nem o Plantel real** (Princípio IV) — usar
  um jogo/equipa de teste já existente no ambiente, ou criar um atleta/jogo
  claramente marcado "teste" pra esta verificação.
- Duas contas distintas com acesso à mesma equipa (ex.: a conta admin +
  `teambench.teste.dataentry@gmail.com`, já existente neste ambiente).

## Cenário 1 — User Story 1 (trava estendida ao corretor pós-jogo)

1. Conta A abre "Corrigir registo" de um jogo de TESTE já terminado.
2. Conta B tenta abrir "Corrigir registo" do MESMO jogo.
3. **Esperado**: Conta B vê mensagem clara de que o jogo está a ser editado por outra
   pessoa e não consegue entrar (FR-001, FR-004, Acceptance Scenario 1).
4. Conta A fecha o corretor (ou navega pra fora).
5. Conta B tenta de novo.
6. **Esperado**: Conta B consegue entrar agora (Acceptance Scenario 2).
7. Conta A reabre o MESMO jogo noutra aba/aparelho.
8. **Esperado**: Conta A não é bloqueada por si própria (FR-002, Acceptance Scenario 3).

## Cenário 2 — User Story 2 (trava de tela em Plantel/Formato/Convites)

Repetir o Cenário 1 três vezes, uma por tela: Plantel, Formato de Jogo, Convites.
Confirmar adicionalmente (FR-005): Conta A editando Plantel não bloqueia Conta B de
editar Formato de Jogo ao mesmo tempo — são travas independentes.

## Cenário 3 — User Story 3 (histórico de acesso)

1. Conta A (Admin) convida um email de teste, aceita o convite com uma terceira
   conta de teste.
2. Conta A abre "Acesso à equipa".
3. **Esperado**: vê a data em que esse novo membro ganhou acesso (FR-007, Acceptance
   Scenario 1).
4. Conta A remove o acesso desse membro de teste.
5. **Esperado**: o histórico mostra a remoção, quando, e que foi a Conta A quem fez
   (FR-008, Acceptance Scenario 2).
6. Repetir como Conta B (papel `data_entry` ou `viewer`) tentando ver "Acesso à
   equipa".
7. **Esperado**: Conta B não vê o histórico (FR-009) — só o Admin vê.

## Cenário 4 — FR-010/011/012 (proteção do último Admin)

1. Numa equipa de TESTE com exatamente UM Admin (a própria Conta A), tentar remover
   o acesso de outro membro não-Admin.
2. **Esperado**: funciona normalmente (FR-010 só protege Admins, Acceptance Scenario 3).
3. Conta A (único Admin) tenta remover o PRÓPRIO acesso ou despromover-se.
4. **Esperado**: bloqueado, com mensagem clara (FR-011, Acceptance Scenario 4).
5. Promover um segundo membro a Admin.
6. Conta A tenta remover-se de novo.
7. **Esperado**: agora funciona (FR-012, Acceptance Scenario 5) — a proteção só vale
   quando restaria zero Admins.

## Cenário 5 — User Story 4 (mensagens compreensíveis)

Mostrar as mensagens de bloqueio dos Cenários 1, 2 e 4 pra alguém sem contexto técnico
(ex.: ler em voz alta, sem explicar antes) e confirmar que a pessoa entende o que
aconteceu e o que fazer a seguir, sem precisar perguntar.

## Regressão a conferir

- Jogo AO VIVO continua a funcionar exatamente como antes (`useMatchLock` não muda,
  só ganha um segundo ponto de chamada) — repetir o fluxo normal de registo ao vivo
  num jogo de teste.
- `npm test --workspace packages/engine` continua 100% a passar, incluindo os testes
  novos de `resourceLock.ts`.
