# Feature Specification: Geração automática de plano de rotação completo

**Feature Branch**: `004-rotation-plan-generation`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Geração automática de plano de rotação completo para o Teambench — depois de entregue o motor de sugestão (specs/003-data-driven-rotation/), que só ordena o seletor de atleta por vaga, o treinador pediu o próximo passo: ajustar o peso de confiança de cada atleta por vaga antes de gerar (sem alterar a aptidão permanente do Plantel), e então gerar 3 opções de plano de rotação completo que respeitem esses pesos, variando o padrão de rotação e o tempo de descanso entre turnos — o treinador escolhe uma opção como ponto de partida e continua podendo editar livremente depois, exatamente como no planeador manual."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ajustar o peso de cada atleta por vaga antes de gerar (Priority: P1)

Antes de pedir um plano automático, o treinador quer poder dar mais ou menos confiança a um atleta numa vaga específica, pra aquele jogo — refletindo a leitura da semana de treinos, sem precisar mudar a classificação permanente do atleta no Plantel. Um exemplo real: um atleta classificado "A" na Ala Esquerda e "B" no Fixo pode, para este jogo específico, precisar jogar mais como Fixo — o treinador ajusta o peso daquele atleta nessa vaga sem tocar na aptidão cadastrada.

**Why this priority**: Sem isto, a geração automática (User Story 2) só teria a aptidão cadastrada como entrada — que é estável e não reflete decisões táticas pontuais do treinador pra aquele jogo específico. É pré-requisito de dados pra qualquer geração fazer sentido, por isso P1 apesar de vir "antes" da geração em si.

**Independent Test**: Pode ser testado abrindo o planeador de um jogo de teste, ajustando o peso de um atleta numa vaga diferente da sua aptidão cadastrada, e confirmando que esse ajuste fica visível e correto, sem alterar a aptidão permanente dele no Plantel.

**Acceptance Scenarios**:

1. **Given** um atleta classificado "A" na Ala Esquerda e "B" no Fixo, **When** o treinador aumenta o peso dele no Fixo pra este jogo, **Then** esse ajuste vale só para este jogo — a aptidão cadastrada no Plantel (A na Ala Esquerda, B no Fixo) continua intacta.
2. **Given** nenhum ajuste manual feito ainda, **When** o treinador abre o ajuste de pesos de um jogo, **Then** cada atleta já aparece com um peso inicial coerente com a aptidão cadastrada (A pesa mais que B, que pesa mais que C) e com o estado dele (um atleta "a retomar" começa com peso sugerido mais baixo que o de um atleta "apto" de mesma aptidão) — sempre editável a partir daí.
3. **Given** um atleta marcado "Indisponível", **When** o treinador vê o ajuste de pesos, **Then** esse atleta não aparece como opção pra receber peso em nenhuma vaga (ele já está fora da rotação, ver FR-004).

---

### User Story 2 - Gerar 3 opções de plano de rotação completo (Priority: P1)

Com os pesos ajustados (ou aceitando os valores sugeridos por padrão), o treinador aciona a geração e recebe 3 opções de plano completo — cada uma preenchendo todas as vagas e partes do jogo, respeitando os mesmos pesos (quem pesa mais recebe mais tempo no total), mas variando COMO esse tempo é distribuído: padrões diferentes de substituição e de descanso entre turnos do mesmo atleta.

**Why this priority**: É o pedido direto do treinador — ter 3 alternativas válidas pra escolher é mais útil do que uma única resposta "certa", já que o treinador conhece nuances (ex.: preferir pouco desgaste num atleta específico) que o sistema não tem como saber sozinho.

**Independent Test**: Pode ser testado com pesos já ajustados (User Story 1), acionando a geração, e conferindo que as 3 opções resultantes (a) todas preenchem o jogo inteiro sem buracos, (b) todas respeitam os mesmos pesos no tempo total por atleta, e (c) diferem entre si no padrão de rotação/descanso.

**Acceptance Scenarios**:

1. **Given** pesos já definidos (ajustados ou padrão) para os atletas incluídos no jogo, **When** o treinador aciona a geração, **Then** recebe 3 opções de plano completo, cada uma preenchendo todas as vagas de linha em todas as partes, sem sobreposição nem buraco.
2. **Given** as 3 opções geradas, **When** o treinador compara o tempo total de um mesmo atleta entre as 3 opções, **Then** esse tempo total é próximo nas 3 (sem variação significativa, dado o mesmo peso) — o que muda mais entre as opções é como esse tempo se divide em turnos (contínuo vs. dividido com descanso) e o momento das substituições; pequenas diferenças de minutos entre opções são esperadas e aceitáveis, grandes diferenças não.
3. **Given** as 3 opções geradas, **When** o treinador escolhe uma delas, **Then** essa opção vira o plano do jogo (salva como os turnos já existentes), pronta pra ser editada normalmente (ver User Story 3).
4. **Given** um atleta marcado "Indisponível", **When** qualquer uma das 3 opções é gerada, **Then** esse atleta nunca aparece em nenhum turno de nenhuma das 3.

---

### User Story 3 - Ajustar livremente o plano escolhido (Priority: P1)

Depois de escolher uma das 3 opções geradas, o treinador quer tratar esse plano exatamente como um plano montado à mão: mover o fim de um turno, trocar quem ocupa uma vaga, remover ou adicionar turnos — sem nenhuma restrição extra por ter vindo de uma geração automática.

**Why this priority**: As opções geradas são só um ponto de partida — nenhuma das 3 precisa estar perfeita, já que o treinador sempre pode refinar depois. Sem edição livre, a geração só ajuda se sair exatamente certa, o que não é realista.

**Independent Test**: Pode ser testado escolhendo uma das 3 opções geradas e editando turnos dela (mover fim, trocar atleta, remover, adicionar) usando exatamente os mesmos controles já existentes no planeador manual.

**Acceptance Scenarios**:

1. **Given** uma das 3 opções escolhida como plano do jogo, **When** o treinador troca o atleta de um turno pelo seletor "Escolher atleta", **Then** a troca é salva normalmente, do mesmo jeito que um turno montado à mão.
2. **Given** o plano escolhido já editado, **When** o treinador volta a essa tela mais tarde, **Then** vê exatamente o plano como ficou depois das edições, não a opção original gerada.

---

### User Story 4 - Gerar novas opções quando os pesos ou dados mudam (Priority: P2)

Entre a primeira geração e o dia do jogo, o treinador pode querer reajustar pesos (ex.: mudou de ideia sobre quem precisa de mais tempo) ou o estado de um atleta pode mudar (ex.: virou "Indisponível"). O treinador quer poder pedir 3 novas opções sem precisar desmontar tudo manualmente primeiro — mas sem perder trabalho sem querer.

**Why this priority**: É uma consequência natural de um fluxo que o treinador vai usar mais de uma vez por jogo, mas não é essencial pro primeiro uso — gerar e escolher uma vez já entrega valor real. Por isso P2, não P1.

**Independent Test**: Pode ser testado escolhendo uma opção, editando-a, ajustando pesos de novo, acionando "gerar novamente", e confirmando que o sistema avisa antes de substituir o que já existe.

**Acceptance Scenarios**:

1. **Given** um plano já escolhido (e possivelmente editado), **When** o treinador aciona a geração de novo, **Then** o sistema avisa explicitamente que isso vai substituir o plano atual e pede confirmação antes de mostrar novas opções.
2. **Given** a confirmação dada, **When** novas 3 opções são geradas com os pesos atualizados, **Then** elas refletem os pesos/dados atuais (não os de uma geração anterior).

---

### Edge Cases

- O que acontece se o treinador aumenta demais o peso de um atleta numa vaga onde ele não tem nenhuma aptidão cadastrada (vaga não habitual)? Deve continuar sendo permitido — o ajuste de peso pra este jogo pode cobrir uma vaga fora do cadastro permanente (é exatamente o caso do exemplo Ala Esquerda/Fixo), mas o atleta não ganha aptidão permanente nova no Plantel por causa disso.
- O que acontece se todos os atletas de uma vaga ficam com peso zero ou muito baixo (ex.: o treinador zera todo mundo por engano)? O sistema ainda deve gerar algo plausível pra essa vaga (distribuindo o tempo disponível entre os convocados pra ela), nunca deixar a vaga vazia só por causa de pesos baixos.
- O que acontece se há mais atletas com peso alto numa vaga do que cabem em turnos de duração razoável? As 3 opções ainda devem gerar algo plausível, dividindo o tempo proporcionalmente ao peso entre todos, nunca travar.
- O que acontece se só há 1 atleta disponível pra uma vaga inteira? Esse atleta recebe o turno inteiro da parte, sozinho, independente do peso — comportamento já esperado do planeador manual.
- Gerar quando NENHUM atleta está incluído no plano ainda deve orientar o treinador a incluir atletas primeiro, nunca falhar silenciosamente ou gerar opções vazias.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A geração de opções de plano de rotação DEVE acontecer só por ação explícita do treinador — nunca automaticamente ao abrir o planeador.
- **FR-002**: O sistema DEVE permitir ao treinador ajustar, para um jogo específico, o peso de cada atleta incluído no plano em cada vaga de linha (Fixo, Ala Esquerda, Ala Direita, Pivô) — esse ajuste vale só para aquele jogo e NUNCA altera a classificação de aptidão permanente do atleta no Plantel (`player_aptitudes`).
- **FR-003**: O peso inicial sugerido (antes de qualquer ajuste manual) DEVE derivar da aptidão cadastrada do atleta naquela vaga (A > B > C > sem classificação) combinada com o estado dele (um atleta "a retomar" começa com peso sugerido mais baixo que um atleta "apto" de mesma aptidão) — sempre livremente editável pelo treinador a partir daí, inclusive pra vagas onde o atleta não tem aptidão cadastrada (ver Edge Cases).
- **FR-004**: Um atleta marcado "Indisponível" NUNCA DEVE receber peso nem aparecer em nenhuma vaga das opções geradas.
- **FR-005**: Acionada a geração, o sistema DEVE produzir exatamente 3 opções de plano de rotação completo, cada uma preenchendo todas as 4 vagas de linha em todas as partes do jogo, sem sobreposição nem buracos.
- **FR-006**: Nas 3 opções, o tempo TOTAL de quadra de cada atleta DEVE ser proporcional ao peso definido para ele (FR-002/FR-003) e próximo entre as 3 opções, sem variação significativa — o que varia mais entre as opções é o padrão de rotação (quando as substituições acontecem) e como esse tempo total se divide em turnos (um turno contínuo vs. vários turnos menores com descanso entre eles). Pequenas diferenças de minutos entre opções, decorrentes de como os turnos se encaixam, são esperadas; uma opção dar bem mais ou bem menos tempo a um atleta que outra não é.
- **FR-007**: O treinador DEVE poder escolher uma das 3 opções geradas para virar o plano salvo do jogo.
- **FR-008**: Todo turno de uma opção escolhida DEVE continuar editável (mover fim, trocar atleta, remover, adicionar) exatamente pelos mesmos controles e regras já existentes no planeador manual — nenhuma limitação adicional.
- **FR-009**: Se o treinador acionar a geração quando já existe um plano para aquele jogo (escolhido antes e/ou editado manualmente), o sistema DEVE avisar explicitamente e pedir confirmação antes de substituir.
- **FR-010**: A geração DEVE continuar restrita ao planeamento pré-jogo — não gera nem altera nada durante o jogo ao vivo.

### Key Entities *(include if feature involves data)*

- **Peso de atleta por vaga, por jogo**: Conceito novo — um número ajustável que representa a confiança do treinador num atleta, numa vaga específica, só para um jogo específico. Começa derivado da aptidão + estado cadastrados (FR-003), mas é independente deles depois de ajustado — nunca escreve de volta em `player_aptitudes`.
- **Opção de plano de rotação**: Um dos 3 planos completos gerados a partir dos pesos de um jogo — enquanto não escolhida, é só uma prévia; ao ser escolhida, vira os turnos reais do jogo (`rotation_plans`/`rotation_plan_stints`, já existentes), indistinguível a partir daí de um turno montado à mão.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um treinador consegue ajustar o peso de um atleta numa vaga específica (inclusive uma vaga fora da aptidão cadastrada dele) sem nenhum efeito na aptidão permanente do Plantel, verificável revisando o Plantel depois do ajuste.
- **SC-002**: Acionando a geração, o treinador recebe 3 opções completas (todas as vagas, todas as partes, sem buracos) em menos de 10 segundos de ação.
- **SC-003**: Em 100% das gerações, o tempo total por atleta não varia significativamente entre as 3 opções (a diferença fica dentro de uma margem pequena, nunca uma opção dando bem mais ou bem menos tempo que outra pro mesmo atleta) — a variação visível entre opções está no padrão de rotação/descanso, não no total de minutos.
- **SC-004**: 0% das opções geradas escalam um atleta marcado "Indisponível" em qualquer turno.
- **SC-005**: Depois de escolhida, 100% das ações de edição já disponíveis no planeador manual funcionam sobre a opção escolhida sem erro ou restrição extra.
- **SC-006**: 100% das tentativas de gerar sobre um plano já existente mostram aviso de confirmação antes de qualquer substituição.

## Assumptions

- O planeador manual (specs/003-data-driven-rotation/, `RotationPlanner.tsx`) continua existindo e funcionando exatamente como hoje — esta feature adiciona um caminho de ajuste de peso + geração de opções, nunca substitui ou remove o caminho manual.
- O ajuste de peso é escopado a um jogo (não persiste pra outros jogos do mesmo atleta) — reflete uma decisão tática pontual, não uma reclassificação permanente.
- A geração usa só os atletas já marcados como "incluídos" no plano pelo treinador (mesmo conceito já existente) — não decide sozinha quem convocar.
- Formato do jogo (duração das partes, número de partes) continua vindo da configuração já existente (`Formato de Jogo`).
- Esta feature resolve o item de roadmap "Prioridade de uso / desembate na rotação" (R02) pelo conceito de peso ajustável — não mais um simples desempate binário entre classificações iguais, mas um modelo contínuo que também cobre o caso de aptidões diferentes na mesma vaga.
- O exato algoritmo de geração das 3 opções (como elas variam o padrão de rotação/descanso mantendo o total por atleta próximo entre si) é detalhe de implementação, a ser definido em `/speckit-plan` — a spec fixa só o resultado observável (3 opções válidas, tempo total por atleta sem variação significativa entre elas, padrões de rotação diferentes).
