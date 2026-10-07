# Quickstart: validar Navegação Multi-Equipa com Segregação de Acesso

Guia de validação de ponta a ponta — não é a lista de tarefas de implementação (isso
é o `tasks.md`, gerado por `/speckit-tasks`), é como confirmar que cada User Story da
spec funciona de verdade depois de implementada.

## Pré-requisitos

- Sem migração nova nesta feature (nenhuma aplicação no Supabase necessária).
- Build local a passar: `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`.
- **Nunca testar contra dados reais do clube** (Princípio IV) — usar a conta/equipa
  de teste já existente no ambiente (ex.: `teambench.teste.dataentry@gmail.com`).
- Pra validar a troca de equipa (Cenário 2), é preciso uma conta associada a 2
  equipas de TESTE — criar uma segunda equipa de teste e adicionar essa conta a
  ambas, se ainda não existir esse estado no ambiente.

## Cenário 1 — User Story 1 (navegação em ecrãs distintos)

1. Entrar com uma conta `team_admin` numa equipa de teste.
2. **Esperado**: em vez de uma página única com tudo empilhado, há uma navegação
   clara entre pelo menos: Calendário/Jogos, Plantel, Formato de Jogo, Acesso à
   Equipa (FR-001, Acceptance Scenario 1).
3. Abrir Plantel, depois trocar para Calendário sem fechar nada manualmente.
4. **Esperado**: a troca funciona sem perder dados de forma inesperada (Acceptance
   Scenario 2).
5. Repetir como conta `viewer`.
6. **Esperado**: continua a ver tudo o que via antes (plantel, jogos, resumo), só
   reorganizado em ecrãs (Acceptance Scenario 3).

## Cenário 2 — User Story 2 (trocar de equipa)

1. Com a conta associada a 2 equipas de teste, entrar na app.
2. **Esperado**: é possível ver em que equipa se está e trocar para a outra
   (FR-003, Acceptance Scenario 1).
3. Trocar de equipa.
4. **Esperado**: todos os ecrãs passam a mostrar os dados e o papel da equipa
   recém-selecionada — conferir que o Plantel mostrado é mesmo o da equipa nova, não
   uma mistura (FR-002, FR-009, Acceptance Scenario 2).
5. Atualizar a página (F5).
6. **Esperado**: continua na mesma equipa e no mesmo ecrã de antes do F5 (FR-004,
   FR-008).
7. Entrar com uma conta de uma equipa só.
8. **Esperado**: não aparece nenhum seletor de troca de equipa (Acceptance Scenario 3).
9. (Se possível simular) remover o acesso dessa conta à equipa selecionada enquanto
   a app está aberta, ou trocar o papel noutra sessão.
10. **Esperado**: ao tentar continuar a usar essa equipa, aparece um aviso claro e a
    app leva para uma equipa válida ou para "sem equipa" (FR-007, Acceptance
    Scenario 4).

## Cenário 3 — User Story 3 (navegação por papel)

1. Entrar como `viewer` numa equipa de teste.
2. **Esperado**: "Acesso à Equipa" não aparece na navegação — nem desabilitado, não
   aparece mesmo (FR-005, Acceptance Scenario 1).
3. Entrar como `data_entry`.
4. **Esperado**: vê as opções de registo de jogo, mas não "Acesso à Equipa"
   (Acceptance Scenario 2).
5. Com a conta de 2 equipas (Cenário 2) com papéis diferentes em cada uma, trocar de
   equipa.
6. **Esperado**: a navegação muda de acordo com o papel na equipa recém-selecionada
   (Acceptance Scenario 3).
7. Tentar aceder a uma área de gestão por fora da navegação (ex.: um estado antigo
   guardado) com uma conta sem permissão.
8. **Esperado**: o servidor continua a bloquear como já bloqueava antes desta
   feature — a navegação escondida nunca é a única proteção (Acceptance Scenario 4).

## Regressão a conferir

- Jogo AO VIVO, corretor pós-jogo e sync offline continuam a funcionar exatamente
  como antes — esta feature só reorganiza a casca de navegação à volta deles, nunca
  o conteúdo interno. Repetir o fluxo normal de registo ao vivo num jogo de teste.
- `npm test --workspace packages/engine` continua 100% a passar, incluindo os testes
  novos de `navigation.ts`.
- As travas de edição (resource_locks, migração 0016) continuam a funcionar nas
  telas de gestão, agora montadas uma de cada vez em vez de todas juntas.
