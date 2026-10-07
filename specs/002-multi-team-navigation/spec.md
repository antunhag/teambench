# Feature Specification: Navegação Multi-Equipa com Segregação de Acesso

**Feature Branch**: `002-multi-team-navigation`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Navegação multi-equipa com segregação de acesso para o Teambench. Hoje tudo corre numa única página, para uma equipa só (useCurrentTeam já assume no máximo uma equipa por utilizador, com um comentário explícito a adiar isto para 'Fase 3'). O esquema (clubs → teams → team_members) já suporta um utilizador pertencer a várias equipas do mesmo clube, mas a UI não. Precisa de: navegação em ecrãs distintos (em vez de uma página só), troca de equipa quando alguém pertence a mais de uma, e a segregação de acesso (Admin/Lançador/Visualizador) refletida na própria navegação. Não inclui criar um papel 'Admin do Clube', nem multi-tenant/multi-clube, nem mudar o modelo de RLS."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encontrar qualquer coisa sem percorrer uma página infinita (Priority: P1)

Hoje `App.tsx` mostra tudo empilhado numa página só: calendário/jogos, plantel, formato de jogo, e acesso à equipa (convites, membros, histórico), sem abas nem navegação nenhuma. Isto já é um problema HOJE, com uma equipa só e um utilizador só — fica uma rolagem longa que mistura o contexto de "estou a tratar de um jogo" com o de "estou a gerir a equipa". A solução é separar isto em ecrãs/secções distintas, agrupadas por tipo de conteúdo.

**Why this priority**: É o único dos três problemas que já afeta o único clube/equipa em produção hoje, independentemente de alguém alguma vez pertencer a 2+ equipas. As outras duas User Stories dependem de existir uma estrutura de navegação para fazer sentido.

**Independent Test**: Um Admin da Equipa abre a app e consegue chegar a "Acesso à Equipa" (ou Plantel, ou Formato de Jogo) em poucos toques, sem precisar de percorrer uma página longa que mistura tudo.

**Acceptance Scenarios**:

1. **Given** um utilizador autenticado com uma equipa, **When** abre a app, **Then** vê uma navegação clara entre as áreas "Jogo" (calendário, jogo ao vivo, corretor pós-jogo) e "Gestão da equipa" (plantel, formato de jogo, acesso à equipa), em vez de tudo numa só página.
2. **Given** o utilizador está num ecrã de gestão (ex.: Plantel), **When** quer ver o calendário de jogos, **Then** consegue trocar de ecrã sem perder o que estava a fazer de forma inesperada (ex.: sem perder uma edição em curso sem aviso).
3. **Given** um utilizador com um papel que só vê (Visualizador), **When** navega pela app, **Then** continua a conseguir consultar tudo o que já conseguia hoje (plantel, jogos, resumo), só reorganizado em ecrãs.

---

### User Story 2 - Trocar de equipa sem terminar sessão (Priority: P2)

Hoje `useCurrentTeam` só lê a primeira equipa que encontra para o utilizador (`.limit(1).maybeSingle()`) — se alguém pertencer a mais de uma equipa do clube (ex.: um treinador que ajuda em dois escalões), só vê uma, escolhida arbitrariamente, sem forma de ver ou trocar para a outra. Isto passa a permitir ver todas as equipas a que se pertence e trocar entre elas.

**Why this priority**: Só traz valor a partir do momento em que existir, na prática, alguém a pertencer a 2+ equipas — o que ainda não acontece no clube em produção hoje, mas é o próximo passo natural de crescimento que motivou esta spec.

**Independent Test**: Uma conta associada a duas equipas consegue ver as duas e trocar de uma para a outra, vendo sempre os dados e o papel corretos da equipa selecionada em cada momento.

**Acceptance Scenarios**:

1. **Given** um utilizador pertence a 2+ equipas, **When** abre a app, **Then** consegue ver em que equipa está e trocar para outra a que também pertence.
2. **Given** o utilizador troca de equipa, **When** a troca acontece, **Then** todos os ecrãs passam a mostrar os dados e o papel (Admin/Lançador/Visualizador) da equipa recém-selecionada, nunca uma mistura das duas.
3. **Given** um utilizador pertence a uma equipa só (o caso de hoje), **When** usa a app, **Then** não vê nenhuma opção de troca de equipa que não faça sentido para ele (sem ruído para quem só tem uma).
4. **Given** um utilizador perde o acesso à equipa que tinha selecionada (ex.: foi removido por um Admin) enquanto a app está aberta, **When** tenta continuar a usar essa equipa, **Then** é avisado com clareza e levado para uma equipa a que ainda pertence (ou para o ecrã de "sem equipa", se não restar nenhuma).

---

### User Story 3 - A navegação só mostra o que dá para usar (Priority: P3)

As regras de quem pode fazer o quê (Admin/Lançador/Visualizador) já existem e já são aplicadas no servidor (RLS) — o que falta é a navegação em si refletir isso, em vez de mostrar uma opção e só bloquear/avisar depois de a pessoa clicar.

**Why this priority**: É um refinamento de clareza sobre as duas User Stories anteriores — só faz sentido depois de existir uma navegação de verdade (US1) e, no caso de haver trocas de equipa (US2), precisa de se ajustar ao papel em CADA equipa, que pode ser diferente.

**Independent Test**: Um Visualizador nunca vê, na navegação, uma opção de gestão que ele não pode usar (ex.: "Acesso à Equipa") — a opção simplesmente não aparece, em vez de aparecer desabilitada ou dar erro ao clicar.

**Acceptance Scenarios**:

1. **Given** um Visualizador, **When** olha para a navegação, **Then** só vê as opções que o seu papel permite usar nessa equipa.
2. **Given** um Lançador de dados, **When** olha para a navegação, **Then** vê as opções de registo de jogo mas não vê "Acesso à Equipa" (gestão de membros).
3. **Given** um utilizador que pertence a 2+ equipas com papéis diferentes em cada uma, **When** troca de equipa, **Then** a navegação muda para refletir o papel na equipa recém-selecionada.
4. **Given** qualquer tentativa de aceder a uma área não permitida por fora da navegação (ex.: link antigo guardado), **When** acontece, **Then** o servidor continua a bloquear exatamente como hoje — esta funcionalidade nunca é a única linha de defesa.

### Edge Cases

- Um utilizador que não pertence a NENHUMA equipa continua a ver o fluxo já existente (criar clube/equipa) — fora do âmbito desta spec, não muda.
- Um utilizador é removido da equipa que tem selecionada enquanto navega noutro separador/aparelho — ver User Story 2, cenário 4.
- Um utilizador é promovido/despromovido (ex.: de Visualizador a Admin) enquanto está com a app aberta — a navegação deve refletir o novo papel assim que a app voltar a confirmar a sessão/papel, sem precisar obrigatoriamente de um F5 manual, mas também sem exigir deteção em tempo real ao segundo.
- Uma equipa ou clube é apagado enquanto o utilizador a tem selecionada — deve cair no mesmo tratamento do cenário 4 da User Story 2 (avisar e levar para uma equipa válida, ou para "sem equipa").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE separar o que hoje é uma única página em ecrãs/secções distintas, agrupadas por tipo de conteúdo: área de Jogo (calendário, jogo ao vivo, corretor pós-jogo, resumo) e área de Gestão da Equipa (plantel, formato de jogo, acesso à equipa).
- **FR-002**: O sistema DEVE continuar a mostrar, em qualquer ecrã, só os dados da equipa atualmente selecionada — nunca misturar dados de equipas diferentes na mesma vista.
- **FR-003**: O sistema DEVE permitir a um utilizador que pertence a mais de uma equipa ver todas as equipas a que pertence e trocar entre elas sem terminar sessão.
- **FR-004**: O sistema DEVE lembrar a última equipa selecionada por um utilizador e reabrir nela da próxima vez que entrar, desde que ainda pertença a ela.
- **FR-005**: O sistema DEVE mostrar, na navegação, apenas as opções que o papel do utilizador NESSA equipa permite usar — removendo completamente da navegação o que não é permitido (ex.: um Visualizador nunca vê sequer o nome "Acesso à Equipa"), nunca mostrando-o desabilitado ou bloqueado.
- **FR-006**: O sistema DEVE continuar a aplicar, no servidor, exactamente as mesmas regras de acesso que já existem hoje (RLS por papel/equipa) — esta funcionalidade é só sobre navegação e apresentação, nunca pode tornar-se a única barreira de proteção.
- **FR-007**: O sistema DEVE avisar com clareza e redirecionar para uma equipa válida (ou para o ecrã de "sem equipa") quando a equipa atualmente selecionada deixa de estar acessível ao utilizador.
- **FR-008**: O sistema DEVE manter o utilizador no mesmo ecrã ao atualizar a página (F5) — não precisa de um link/endereço próprio e partilhável por ecrã nesta fase.
- **FR-009**: Trocar de equipa DEVE atualizar a navegação e todos os ecrãs para refletir o papel e os dados da equipa recém-selecionada. Para quem pertence a 2+ equipas, um seletor sempre visível (ex.: no topo da navegação) DEVE mostrar a equipa atual e permitir trocar a partir de qualquer ecrã, sem precisar de voltar a um ecrã de escolha à parte.

### Key Entities

- **Equipa selecionada**: a equipa que a navegação e os ecrãs mostram num dado momento, para um utilizador que pode pertencer a mais de uma — conceito novo nesta funcionalidade; hoje não existe porque só se considera uma equipa.
- **Item de navegação**: cada área/ecrã da app (Calendário, Jogo ao Vivo, Plantel, Formato de Jogo, Acesso à Equipa, ...), cada um com um papel mínimo necessário para aparecer/ser usado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir de qualquer ecrã, chegar a qualquer outro ecrã da app (Jogo ou Gestão) demora no máximo 2 toques/cliques.
- **SC-002**: Um utilizador que pertence a 2+ equipas consegue trocar de equipa em menos de 2 toques/cliques, sem terminar sessão.
- **SC-003**: Um Visualizador ou Lançador de dados nunca encontra, na navegação, uma opção que ao usar lhe diga "não tem permissão" — porque essa opção simplesmente não é mostrada a quem não pode usá-la.
- **SC-004**: Zero casos de dados de uma equipa aparecerem misturados com os de outra equipa, mesmo depois de trocas de equipa repetidas na mesma sessão.

## Assumptions

- O agrupamento "Jogo" vs. "Gestão da Equipa" (FR-001) é um palpite razoável com base no conteúdo já existente em `apps/web/src/match/` vs. `apps/web/src/team/` — pode ser ajustado em `/speckit-plan` se, ao desenhar os ecrãs, outro agrupamento se mostrar mais claro para um treinador não-técnico.
- O clube em produção hoje tem uma equipa só em uso real — a User Story 2 (troca de equipa) não tem ainda utilizador real multi-equipa para validar, mas a estrutura de dados já suporta este cenário (Princípio III da constituição) e deve ser desenhada para ele.
- Esta funcionalidade não cria, muda nem remove nenhum papel existente (team_admin/data_entry/viewer) nem o papel "Admin do Clube" (adiado para uma spec futura separada, ver `docs/ROADMAP.md`).
- Esta funcionalidade não altera o modelo de RLS — reutiliza inteiramente as regras de acesso já existentes e testadas.
