# Research: Navegação Multi-Equipa com Segregação de Acesso

## Decisão 1: Sem biblioteca de router — estado local + localStorage

**Decisão**: O ecrã ativo vive em estado local (`useActiveScreen.ts`), persistido em
`localStorage` só para sobreviver a um F5 (FR-008, já resolvido na clarificação:
não precisa de link próprio e partilhável por ecrã).

**Rationale**: `apps/web` não tem nenhuma biblioteca de router hoje (confirmado em
`apps/web/package.json`) e o projeto evita dependências novas sem necessidade clara
(ver `useLiveMatch.ts`/`sync/outbox.ts`, que já usam `localStorage` pelo mesmo motivo:
sobreviver a recarregar a página, por aparelho). Adicionar um router só pra manter o
ecrã ao atualizar seria peso a mais pra um requisito que `localStorage` já resolve.

**Alternatives considered**: `preact-router` (ou similar) com uma rota por ecrã —
rejeitado por agora: traria deep-linking/URLs partilháveis, que a clarificação de
FR-008 disse explicitamente não ser necessário nesta fase. Fica como opção óbvia se
um dia isso mudar (ex.: alguém pedir "enviar o link direto do Plantel").

## Decisão 2: `useCurrentTeam` é substituído, não estendido

**Decisão**: `apps/web/src/team/useCurrentTeam.ts` é removido; `useUserTeams.ts`
assume o seu papel, com um contrato diferente (lista de equipas + equipa
selecionada + função de troca, em vez de uma equipa só).

**Rationale**: O contrato muda de forma (singular → lista), não só de conteúdo.
`useCurrentTeam` só tem um consumidor (`App.tsx`) — manter os dois hooks em paralelo
(um "antigo" por trás de um "novo") só criaria confusão sobre qual é a fonte de
verdade, sem nenhum ganho de compatibilidade real a proteger.

**Alternatives considered**: Manter `useCurrentTeam` como atalho fino sobre
`useUserTeams` (ex.: `useCurrentTeam = () => useUserTeams().selected`) — rejeitado,
não há segundo consumidor que precise dessa forma reduzida.

## Decisão 3: Última equipa selecionada fica em `localStorage`, por aparelho

**Decisão**: Não sincronizada entre aparelhos — se o treinador trocar de equipa no
telemóvel, o tablet do clube continua a abrir na equipa que tinha antes, até alguém
trocar lá também.

**Rationale**: Resolve o FR-004 com a mesma ferramenta já estabelecida no projeto pra
estado "conveniência, não crítico" (Decisão 1). Introduzir uma tabela nova no
Supabase só pra guardar uma preferência de UI seria desproporcional — a Assumption
da spec já antecipa que não há ainda nenhum utilizador real multi-equipa pra validar
se sincronizar entre aparelhos sequer importa na prática.

**Alternatives considered**: Guardar a preferência numa tabela `user_preferences` no
Supabase, sincronizada entre aparelhos — rejeitado por agora (YAGNI, Princípio III);
revisitar se/quando aparecer um caso real de alguém a trocar de aparelho a meio do
fluxo e sentir falta disso.

## Decisão 4: Visibilidade de navegação por papel é uma função pura, com lista de itens escondidos (não desabilitados)

**Decisão**: `packages/engine/src/navigation.ts` define os itens de navegação
possíveis (id, rótulo, papel mínimo) e uma função pura `visibleNavItems(role)` que
devolve só os que o papel atual permite — consistente com a clarificação de FR-005
(esconder completamente, nunca mostrar desabilitado).

**Rationale**: Mesma extração de lógica pura já usada em `resourceLock.ts`
(feature anterior) — testável em `packages/engine/test/` sem DOM/rede, e evita
duplicar a regra "quem vê o quê" espalhada por componentes diferentes.

**Alternatives considered**: Calcular a visibilidade inline em `Nav.tsx` — rejeitado,
mais difícil de testar isoladamente e arrisca divergir se outro ecrã precisar da
mesma lógica no futuro.

## Decisão 5: Perda de acesso à equipa selecionada é detetada por reconsulta periódica, não Realtime

**Decisão**: `useUserTeams.ts` reconsulta a lista de equipas do utilizador num
intervalo (mesma ordem de grandeza do heartbeat já usado em `useResourceLock.ts`,
20s) e ao recuperar o foco da janela — se a equipa selecionada já não estiver na
lista devolvida, mostra o aviso do FR-007 e troca para outra equipa válida (ou para
"sem equipa").

**Rationale**: Supabase Realtime não é usado em nenhuma parte do projeto hoje
(confirmado por pesquisa no código) — introduzi-lo só para este caso seria a
primeira dependência de uma tecnologia nova pra um cenário relativamente raro
(alguém ser removido a meio de uma sessão aberta). Reconsulta periódica reaproveita
exatamente o padrão (intervalo + verificação) já usado nas travas de edição.

**Alternatives considered**: Supabase Realtime (subscrição a mudanças em
`team_members`) — mais imediato, mas é tecnologia nova no projeto pra resolver um
caso de borda; fica como opção se o polling se mostrar insuficiente na prática.
Detetar só reativamente quando uma escrita falha por RLS — rejeitado sozinho,
porque um Visualizador pode passar a sessão inteira sem fazer nenhuma escrita.

## Decisão 6: Navegação é uma lista plana de abas, não um menu em duas camadas

**Decisão**: Todos os ecrãs (Calendário, Jogo ao Vivo, Plantel, Formato de Jogo,
Acesso à Equipa) aparecem como abas no mesmo nível, agrupados visualmente (ex.: por
ordem ou um separador) em "Jogo" vs. "Gestão da Equipa" — nunca um menu que exige
escolher a área primeiro e o ecrã depois.

**Rationale**: Com poucos ecrãs no total (4-6), uma lista plana já cumpre SC-001
("no máximo 2 toques", aqui conseguido em 1) sem a complexidade extra de navegação
em duas camadas — mais simples pra um treinador não-técnico (Princípio V).

**Alternatives considered**: Menu em duas camadas (escolher "Jogo" ou "Gestão",
depois o ecrã) — rejeitado, adiciona um toque a cada navegação sem benefício claro
na escala atual da app.
