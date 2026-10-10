# Feature Specification: Replaneamento de rotação durante o jogo

**Feature Branch**: `006-live-rotation-replan`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "Replaneamento de rotação durante o jogo, reagindo a eventos reais (atleta fica indisponível, mudança de postura tática) — Teambench."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber que o plano ficou desatualizado assim que um atleta fica indisponível (Priority: P1)

Durante o jogo, um atleta do plano de rotação já escolhido precisa sair (lesão, expulsão, mal súbito) e é marcado como indisponível. Hoje o plano de rotação continua exatamente como estava — ninguém avisa o treinador que os turnos futuros desse atleta não fazem mais sentido. O treinador precisa perceber isso sozinho, no meio do jogo, olhando turno a turno. O sistema deve mostrar, assim que o atleta é marcado indisponível, que o plano de rotação tem turnos futuros afetados por essa mudança.

**Why this priority**: É o valor mínimo que resolve o problema relatado sem exigir nenhuma decisão de motor de otimização — hoje a falha é o silêncio total (plano desatualizado sem nenhum aviso), e resolver só isso já evita o pior caso (o treinador seguir cegamente um plano que não é mais válido).

**Independent Test**: Com um plano de rotação já escolhido pro jogo, marcar um atleta que aparece em turnos futuros como indisponível, e confirmar que o sistema mostra um aviso claro identificando quais turnos/vagas ficaram afetados.

**Acceptance Scenarios**:

1. **Given** um plano de rotação em andamento com um atleta escalado em turnos futuros, **When** esse atleta é marcado indisponível, **Then** o sistema mostra um aviso identificando os turnos/vagas futuros afetados, sem alterar nada automaticamente.
2. **Given** um atleta marcado indisponível que NÃO aparece em nenhum turno futuro do plano (já tinha saído de quadra antes), **When** a mudança é registrada, **Then** nenhum aviso é mostrado (nada no plano foi afetado).

---

### User Story 2 - Pedir uma sugestão de replaneamento pro tempo restante do jogo (Priority: P1)

Depois de ver que o plano ficou desatualizado (User Story 1), o treinador quer uma sugestão de como cobrir o tempo que falta sem o atleta indisponível — sem precisar montar manualmente, turno a turno, sob pressão, no meio do jogo. O treinador pede um replaneamento; o sistema gera uma sugestão nova cobrindo só o tempo que falta (nunca mexe no que já foi jogado/registrado), respeitando os mesmos princípios já usados no plano pré-jogo (confiança por vaga, limites já configurados).

**Why this priority**: É a ação que de fato resolve o problema relatado pelo treinador (reagir a um evento real do jogo) — a User Story 1 só avisa, esta entrega o valor completo. P1 junto com a primeira porque uma não tem muito valor prático sem a outra num cenário real de jogo.

**Independent Test**: Com um aviso de plano desatualizado (User Story 1) na tela, acionar o replaneamento e confirmar que a sugestão gerada cobre exatamente o tempo restante do jogo, nunca reabre turnos já jogados, e nunca inclui o atleta indisponível.

**Acceptance Scenarios**:

1. **Given** um aviso de plano desatualizado por indisponibilidade de um atleta, **When** o treinador aciona o replaneamento, **Then** o sistema gera uma sugestão cobrindo do momento atual até o fim do jogo, sem o atleta indisponível em nenhuma vaga.
2. **Given** uma sugestão de replaneamento gerada, **When** o treinador a revisa, **Then** turnos já jogados/registrados antes do momento atual continuam exatamente como estavam — o replaneamento nunca os reabre nem os reescreve.
3. **Given** uma sugestão de replaneamento gerada, **When** o treinador decide não usá-la, **Then** o plano original continua em vigor sem nenhuma mudança — a sugestão nunca é aplicada sozinha.

---

### User Story 3 - Confirmar antes de substituir o plano em andamento (Priority: P2)

O treinador nunca quer que uma sugestão gerada durante o jogo substitua silenciosamente o plano que a equipa já está seguindo — precisa ver exatamente o que vai mudar (quais turnos futuros, quais atletas entram/saem) antes de confirmar.

**Why this priority**: É uma garantia de confiança sobre a User Story 2, mesmo princípio já aplicado ao plano pré-jogo (nunca substituir um plano já montado sem confirmação explícita) — P2 porque é uma camada de segurança sobre uma capacidade que já existe por causa da US2, não uma capacidade nova isolada.

**Acceptance Scenarios**:

1. **Given** uma sugestão de replaneamento gerada durante o jogo, **When** o treinador a visualiza antes de confirmar, **Then** o sistema mostra claramente quais turnos futuros mudam em relação ao plano atual.
2. **Given** uma sugestão de replaneamento visualizada, **When** o treinador confirma, **Then** só a partir desse momento o plano em vigor passa a ser a sugestão — nada muda antes da confirmação explícita.

---

### Edge Cases

- O que acontece se o treinador pedir um replaneamento faltando pouquíssimo tempo de jogo (ex.: últimos 2 minutos)? O sistema deve continuar tentando gerar uma sugestão válida pro tempo restante, por menor que seja, nunca recusar só por ser pouco tempo.
- O que acontece se, depois da indisponibilidade, não sobrarem atletas suficientes pra cobrir todas as vagas pro tempo restante (ex.: perder o único atleta elegível pra uma vaga)? O sistema deve mostrar isso claramente como parte do aviso/sugestão, não falhar silenciosamente nem inventar uma escalação inválida.
- O que acontece se MAIS de um atleta ficar indisponível antes do treinador agir sobre o primeiro aviso? O aviso/sugestão deve refletir todas as indisponibilidades vigentes no momento do replaneamento, não só a primeira.
- O que acontece se o treinador editar manualmente o plano em andamento (como já pode fazer hoje) entre o aviso e o replaneamento? O replaneamento deve partir do estado mais recente do plano (incluindo edições manuais já feitas), nunca de uma versão desatualizada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE detectar, durante um jogo em andamento, quando um atleta marcado indisponível aparece em algum turno futuro do plano de rotação já escolhido.
- **FR-002**: O sistema DEVE mostrar um aviso claro ao treinador identificando os turnos/vagas futuros afetados por essa indisponibilidade, sem alterar o plano automaticamente.
- **FR-003**: O sistema DEVE permitir ao treinador pedir uma sugestão de replaneamento cobrindo o tempo restante do jogo (do momento atual até o fim), excluindo qualquer atleta indisponível.
- **FR-004**: O replaneamento NUNCA deve alterar turnos já jogados/registrados antes do momento em que foi acionado.
- **FR-005**: O replaneamento DEVE respeitar os mesmos dados e limites já configurados pro jogo (confiança por vaga, e os limites de minutos de specs/005-athlete-minute-limits quando essa feature já estiver implementada).
- **FR-006**: Uma sugestão de replaneamento DEVE ser apresentada ao treinador pra revisão antes de substituir o plano em vigor — nunca aplicada automaticamente sem confirmação explícita.
- **FR-007**: O sistema DEVE identificar claramente, na sugestão de replaneamento, quais turnos futuros mudam em relação ao plano anterior.
- **FR-008**: Se não houver atletas suficientes pra cobrir alguma vaga no tempo restante, o sistema DEVE mostrar isso claramente ao treinador como parte do aviso/sugestão, nunca falhar silenciosamente nem gerar uma escalação com vaga sem ninguém.
- **FR-009**: O replaneamento ao vivo DEVE ser acionado sob ação explícita do treinador — o sistema só mostra o aviso (FR-002), nunca gera nem aplica uma sugestão sozinho. O treinador decide quando pedir o replaneamento, podendo inclusive ajustar manualmente primeiro se preferir (Clarificação 1, resolvida — mesmo princípio já usado no plano pré-jogo: nunca gerar/substituir sem ação explícita).
- **FR-010**: O sistema DEVE devolver uma sugestão de replaneamento em menos de 1 minuto, sempre, independente de quanto tempo de jogo ainda resta (Clarificação 2, resolvida). Isso exige o motor rápido já existente no app (heurístico, mesma lógica do plano pré-jogo, resolve em milissegundos) — o motor MILP (`tools/rotation-solver/`) não garante esse teto de forma confiável pra qualquer momento do jogo (testado em ~2 minutos pro jogo inteiro; só ficaria sob 1 minuto em replaneamentos tardios, com pouco tempo restante, o que não cobre o caso geral) e por isso fica fora desta entrega — pode voltar a ser avaliado no futuro se um teto de tempo mais flexível for aceitável.
- **FR-011**: Replaneamento por mudança de POSTURA TÁTICA (mais defensivo/ofensivo após um golo) fica FORA desta entrega (Clarificação 3, resolvida) — não existe hoje nenhum dado que capture "quão defensivo/ofensivo" é um atleta; definir esse conceito e desenhar como ele afeta a geração fica como uma entrega futura separada. Esta entrega cobre só reação à indisponibilidade de atleta.

### Key Entities *(include if feature involves data)*

- **Aviso de plano desatualizado**: Derivado em tempo real (não persistido) a partir do plano de rotação já escolhido + o estado de disponibilidade atual dos atletas + o momento atual do jogo — nunca um dado novo guardado, só uma leitura cruzada do que já existe.
- **Sugestão de replaneamento**: Mesma estrutura já usada pelas opções do plano pré-jogo (`RotationPlanOption`, turnos + minutos totais) — mas cobrindo só o intervalo [momento atual, fim do jogo], nunca o jogo inteiro. Só persiste nas tabelas de plano já existentes (`rotation_plan_stints`) se e quando o treinador confirmar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Assim que um atleta escalado em turnos futuros é marcado indisponível durante o jogo, o treinador vê um aviso em até alguns segundos — nunca precisa perceber sozinho olhando turno a turno.
- **SC-002**: Uma sugestão de replaneamento nunca inclui o atleta indisponível em nenhuma vaga, e nunca altera turnos já jogados antes do momento do replaneamento — verificável em 100% das sugestões geradas.
- **SC-003**: O treinador consegue revisar e decidir (confirmar ou descartar) uma sugestão de replaneamento sem precisar editar manualmente turno a turno pra chegar a um plano usável pro resto do jogo, no caso comum (vagas suficientes cobertas).
- **SC-004**: Uma sugestão de replaneamento nunca é aplicada ao jogo em andamento sem uma confirmação explícita do treinador — verificável em 100% dos casos.
- **SC-005**: Uma sugestão de replaneamento fica pronta pro treinador revisar em menos de 1 minuto a partir do pedido, em qualquer momento do jogo — nunca o treinador espera minutos no meio de uma partida real.

## Assumptions

- O replaneamento ao vivo reaproveita os mesmos dados de confiança/limites já configurados pro jogo (specs/004, specs/005) — esta entrega não introduz uma forma nova de o treinador expressar preferências, só reage a uma mudança de disponibilidade usando o que já está configurado.
- "Turno já jogado/registrado" significa qualquer turno cujo intervalo de tempo já passou em relação ao momento atual do jogo (cronómetro ao vivo) — não depende de nenhum registo manual adicional além do que o jogo ao vivo já rastreia hoje.
- O motor usado é o heurístico rápido já existente (`packages/engine/src/rotationGenerator.ts`), nunca o motor MILP (`tools/rotation-solver/`) — o teto de resposta em menos de 1 minuto (SC-005) exige isso; o MILP continua reservado ao plano pré-jogo, onde minutos de espera não importam.
- Esta entrega não cobre: ajuste automático sem nenhuma ação do treinador em nenhum momento do fluxo (sempre há pelo menos uma confirmação explícita antes de qualquer turno futuro mudar de verdade); histórico/versionamento de múltiplos replaneamentos ao longo do mesmo jogo (cada replaneamento substitui a visão anterior, não empilha versões); integração com cartões/faltas/substituições já registadas além de disponibilidade do atleta; replaneamento por mudança de postura tática (defensivo/ofensivo) — fica como entrega futura separada, dependente de um conceito de dado que ainda não existe.
