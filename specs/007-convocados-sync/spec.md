# Feature Specification: Robustez da seleção de convocados

**Feature Branch**: `007-convocados-sync`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "Robustez da seleção de convocados — persistir entre sessões e permitir adicionar após o apito inicial. Incidente real: treinador tinha 12 jogadores presentes mas a app só tinha 10 selecionados como convocados no apito — a seleção feita antes não veio completa. No meio do jogo precisou de um dos 2 jogadores de fora e não havia forma de adicioná-lo pela tela de Jogo ao vivo — parou de registar eventos pro resto da partida."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A seleção de convocados nunca se perde antes do apito (Priority: P1)

O treinador abre o jogo antes da partida e vai marcando quem está presente e disponível (convocados) e quem começa a jogar (titulares). Se precisar sair da tela, trocar de aparelho (ex.: do telemóvel pro tablet), reabrir a app, ou perder a ligação momentaneamente, a seleção já feita continua lá exatamente como estava quando voltar — em qualquer aparelho que use para entrar no mesmo jogo.

**Why this priority**: É a causa direta do incidente real que motivou esta entrega — a seleção de convocados feita antes do jogo não "veio" completa na hora do apito, obrigando o treinador a escolher às pressas sob pressão de tempo e a começar o jogo com menos jogadores disponíveis do que realmente tinha presentes. Sem isto, qualquer outra melhoria (User Story 2 incluída) continua a deixar a porta aberta pro mesmo problema acontecer de novo.

**Independent Test**: Marcar convocados e titulares num jogo ainda não iniciado, sair da tela (ou simular trocar de aparelho/sessão) antes de dar o apito, voltar a abrir o mesmo jogo e confirmar que a seleção está exatamente como foi deixada — sem precisar reconstruir nada a partir dos eventos do jogo (que nesse ponto ainda não existem).

**Acceptance Scenarios**:

1. **Given** um jogo ainda não iniciado, **When** o treinador marca alguns atletas como convocados e titulares e depois fecha a aba/app sem dar o apito, **Then** ao reabrir o mesmo jogo (no mesmo aparelho) a seleção aparece exatamente como foi deixada.
2. **Given** uma seleção de convocados/titulares já feita num jogo ainda não iniciado, **When** o treinador abre o mesmo jogo noutro aparelho (ex.: tablet em vez do telemóvel usado antes), **Then** vê a mesma seleção, não uma lista vazia.
3. **Given** uma seleção em curso, **When** a ligação à internet falha momentaneamente enquanto o treinador continua a marcar atletas, **Then** nenhuma marcação feita fica perdida assim que a ligação volta — nem é preciso refazer o que já tinha marcado offline.

---

### User Story 2 - Chamar um atleta ao banco mesmo depois do apito (Priority: P2)

Durante o jogo ao vivo, o treinador percebe que precisa de um atleta que não ficou na lista de convocados antes do apito (esqueceu-se de marcar, ou o atleta só chegou ao pavilhão depois do jogo já ter começado). Em vez de ficar sem opção de o trazer para o jogo — ou pior, ter que parar de registar o jogo todo — o treinador consegue adicioná-lo ao banco a qualquer momento, ficando disponível para entrar numa substituição a partir daí.

**Why this priority**: É o que teria evitado o treinador ter que abandonar o registo do jogo de ontem a meio da 2ª parte. Depende de a User Story 1 já reduzir bastante a chance de isto ser necessário — mas mesmo com a seleção bem guardada, vai sempre poder faltar alguém na lista original (atleta atrasado, esquecimento), por isso é uma rede de segurança separada, não uma duplicação da User Story 1.

**Independent Test**: Com um jogo já em curso (apito já dado), abrir a lista de banco/substituições e confirmar que é possível adicionar um atleta que não estava nos convocados originais, e que ele passa a aparecer como opção para entrar numa substituição a partir desse momento.

**Acceptance Scenarios**:

1. **Given** um jogo ao vivo já iniciado, **When** o treinador adiciona ao banco um atleta que não estava na lista de convocados original, **Then** esse atleta passa a aparecer como opção disponível para entrar em quadra a partir desse momento (nunca antes, nunca retroativamente).
2. **Given** um atleta acabado de adicionar ao banco a meio do jogo, **When** o treinador faz uma substituição trazendo esse atleta para quadra, **Then** o registo do jogo continua normalmente, sem precisar de nenhum passo de correção posterior.

---

### User Story 3 - Aviso de poucos convocados (Priority: P3)

Ao marcar os convocados antes do jogo, se o treinador tiver marcado menos atletas do que o mínimo esperado pro formato daquele jogo, o sistema avisa — dando a chance de reparar no esquecimento antes do apito, em vez de só descobrir a falta a meio do jogo (como aconteceu no incidente real).

**Why this priority**: É um complemento às User Stories 1 e 2, não uma substituição — mesmo com a seleção bem guardada (US1) e a possibilidade de adicionar alguém depois (US2), continua a valer a pena avisar cedo quando a contagem está visivelmente abaixo do normal, porque US1/US2 resolvem a perda técnica da seleção, mas não um esquecimento genuíno do treinador ao marcar.

**Independent Test**: Configurar um mínimo de convocados para um Formato de Jogo, marcar menos atletas do que esse mínimo num jogo desse formato, e confirmar que aparece um aviso antes do apito — e que marcar o suficiente faz o aviso desaparecer.

**Acceptance Scenarios**:

1. **Given** um Formato de Jogo com um mínimo de convocados configurado, **When** o treinador marca menos atletas como convocados do que esse mínimo, **Then** vê um aviso claro antes de poder dar o apito (sem ser bloqueado — o treinador pode avançar mesmo assim, é só um alerta).
2. **Given** o aviso de poucos convocados visível, **When** o treinador marca mais um atleta e atinge o mínimo, **Then** o aviso desaparece automaticamente.
3. **Given** um Formato de Jogo sem mínimo configurado, **When** o treinador marca convocados num jogo desse formato, **Then** nenhum aviso de contagem aparece — o aviso só é mostrado quando um mínimo foi explicitamente definido.

---

### Edge Cases

- Dois aparelhos/sessões diferentes marcam convocados no mesmo jogo ao mesmo tempo (ex.: treinador principal e assistente, cada um no seu telemóvel) antes do apito — a última marcação a chegar não pode apagar silenciosamente as marcações feitas no outro aparelho entretanto.
- O treinador adiciona um atleta ao banco a meio do jogo que, por engano, já estava marcado como indisponível no plantel (ex.: lesionado) — o sistema não deve impedir, mas deve deixar claro que está fora do habitual.
- A app é reaberta já depois do apito ter sido dado (noutro aparelho ou após reinício) — a lista de convocados/banco mostrada tem de refletir a seleção real feita antes do apito, não aparecer vazia nem forçar a recomeçar do zero.
- O treinador tenta adicionar ao banco um atleta que já está marcado como "indisponível" (lesão) no cadastro da equipa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST guardar a seleção de convocados e titulares de forma que sobreviva a fechar a aba/app, trocar de aparelho, ou perder a ligação momentaneamente — sempre que isso aconteça antes do apito inicial.
- **FR-002**: Ao reabrir um jogo ainda não iniciado em qualquer aparelho autorizado a acompanhá-lo, o sistema MUST mostrar a seleção de convocados/titulares tal como estava na última alteração guardada, nunca uma lista vazia por defeito.
- **FR-003**: O sistema MUST permitir adicionar um atleta à lista de convocados/banco a qualquer momento durante um jogo já em curso (depois do apito), não só antes.
- **FR-004**: Um atleta adicionado ao banco depois do apito MUST ficar disponível para ser escalado numa substituição a partir desse momento, sem nenhum passo adicional de correção.
- **FR-005**: Adicionar um atleta ao banco depois do apito MUST NOT alterar retroativamente nenhum evento do jogo já registado antes desse momento (quem já esteve em quadra, golos, faltas, etc. continuam exatamente como foram registados).
- **FR-006**: A lista de titulares (quem começa a jogar) continua MUST NOT poder ser alterada depois do apito — isso já funciona hoje e não muda com esta entrega; só a lista de convocados/banco ganha a flexibilidade de FR-003.
- **FR-007**: O sistema MUST sincronizar cada alteração de convocados/titulares imediatamente (a cada marcação/desmarcação individual), não só num momento explícito de confirmação — é o que protege contra o cenário real do incidente, onde o treinador foi interrompido a meio da seleção, antes de qualquer passo de "confirmar".
- **FR-008**: Adicionar um atleta ao banco depois do apito MUST ser uma ação direta, sem exigir confirmação adicional — mesmo nível de fricção que marcar um convocado antes do jogo, já que o cenário típico é sob pressão de tempo durante o jogo.
- **FR-009**: Esta entrega NÃO precisa de incluir nenhuma forma de retomar ou encerrar formalmente jogos que ficaram "presos" sem nunca terem sido fechados (como o jogo de ontem) — fica fora de escopo, é só prevenção daqui pra frente. Um jogo que ficou preso por este motivo específico deixa de poder acontecer com FR-001 a FR-006 implementados; casos residuais ficam para uma entrega futura, se necessário.
- **FR-010**: Quando duas sessões diferentes marcam convocados no mesmo jogo por volta do mesmo momento (ex.: dois aparelhos do mesmo treinador, ou treinador principal e assistente), o sistema MUST combinar as marcações em vez de uma sobrescrever silenciosamente a outra — nenhuma marcação feita por uma sessão pode desaparecer só porque outra sessão também gravou por perto.
- **FR-011**: O sistema MUST permitir configurar, por Formato de Jogo, um número mínimo de convocados esperado — reaproveitando a configuração de formato já existente (onde hoje já vivem período/duração), em vez de criar um conceito novo de "competição".
- **FR-012**: Quando a contagem de convocados marcados for menor que o mínimo configurado pro formato daquele jogo, o sistema MUST mostrar um aviso visível antes do apito — sem bloquear o treinador de avançar mesmo assim, já que pode ser intencional (ex.: equipa com menos atletas disponíveis naquele dia).
- **FR-013**: Se o Formato de Jogo não tiver um mínimo configurado, o sistema MUST NOT mostrar nenhum aviso de contagem — o aviso é sempre opt-in, nunca um valor por defeito imposto.

### Key Entities *(include if feature involves data)*

- **Seleção de convocados do jogo**: quem está disponível para jogar numa partida específica — hoje existe só como estado temporário num aparelho, não é um registo que sobrevive entre sessões ou aparelhos.
- **Titulares**: subconjunto dos convocados que começa o jogo em quadra — continua fixo assim que o apito é dado, sem mudança nesta entrega.
- **Jogo (partida)**: já existe hoje; passa a ser o ponto de referência único de onde a seleção de convocados é lida/guardada, em vez de viver presa a um aparelho.
- **Formato de Jogo**: já existe hoje (período, duração); ganha um número mínimo de convocados esperado, opcional, usado só pelo aviso da User Story 3.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um treinador que marca convocados num aparelho e reabre o mesmo jogo noutro aparelho (ou depois de reiniciar a app) vê 100% da seleção preservada, nunca uma lista vazia.
- **SC-002**: Zero jogos precisam de ser abandonados a meio (registo interrompido) por falta de um atleta disponível na lista de convocados — qualquer atleta do plantel pode ser chamado ao banco a qualquer momento do jogo.
- **SC-003**: Adicionar um atleta ao banco durante o jogo ao vivo leva menos de 10 segundos, sem sair da tela de acompanhamento ao vivo.
- **SC-004**: Num formato de jogo com mínimo configurado, 100% dos jogos que chegam ao apito com convocados abaixo desse mínimo mostraram o aviso antes de o apito ser possível.

## Assumptions

- O plantel da equipa (lista completa de atletas) já existe e está acessível durante o jogo ao vivo — esta entrega só muda quem, dentro desse plantel, está marcado como disponível para a partida específica.
- Esta entrega não cobre retroativamente jogos já encerrados ou já perdidos por este bug (como o jogo de ontem vs. AD Modicus Sandim) — o treinador confirmou explicitamente que não quer correção de dados históricos, só prevenção.
- A lista de titulares (quem começa a jogar) permanece fixa depois do apito, exatamente como hoje — esta entrega não introduz nenhuma forma de trocar titulares retroativamente.
- Um número **máximo** de atletas convocados e um máximo de pessoas no banco (regras de competição, ex.: limite da federação) ficam fora desta entrega — ideia levantada durante a definição do spec, mas sem uso concreto ainda planeado; fica em backlog até haver necessidade clara de validar/bloquear por um teto, em vez de só avisar por um mínimo.
