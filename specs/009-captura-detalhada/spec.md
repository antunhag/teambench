# Feature Specification: Captura detalhada de estatísticas (segunda tela de jogo ao vivo)

**Feature Branch**: `009-captura-detalhada`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Captura detalhada de estatísticas — segunda tela de jogo ao vivo, autossuficiente, para um diretor/analista dedicado. O 'Jogo ao vivo' de hoje é pensado pro treinador (simples). Quem regista dados ao vivo neste clube é um diretor dedicado só a isso — pode ter uma tela bem mais densa, com linha por jogador (remate/cartões/falta, com zona) e um painel de equipa (fase de jogo, posse, transição com vantagem numérica, bola parada, ações defensivas, goleiro-linha). Precisa de ser autossuficiente (apito, substituição, pausa, fim de parte — mesma lógica do motor já existente). Resultado real: no pós-jogo, mostrar as transições ofensivas perdidas com vantagem numérica real."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O diretor regista o jogo inteiro sozinho, sem nunca precisar do "Jogo ao vivo" (Priority: P1)

Um diretor dedicado a registar estatísticas entra na nova tela antes do apito, escolhe os titulares, dá o apito inicial, e acompanha o jogo até ao fim — golos, cartões, faltas, substituições, pausas, remates por jogador — sem nunca precisar de abrir a tela "Jogo ao vivo" de hoje. Cada ação já sai atribuída ao jogador certo, porque está a tocar na linha dele.

**Why this priority**: É a base de tudo o resto. Sem autossuficiência real, a nova tela não substitui nada — fica só um complemento que ainda obriga o diretor a alternar de tela, o que era exatamente o problema a evitar. Nenhuma outra user story faz sentido entregar antes desta.

**Independent Test**: Num jogo de teste, usar só a tela nova do apito ao fim do jogo — escalação, apito, pelo menos uma substituição, uma pausa, um golo, um cartão, fim de parte e fim de jogo — e confirmar que o jogo fica corretamente registado, idêntico ao que "Jogo ao vivo" produziria para as mesmas ações.

**Acceptance Scenarios**:

1. **Given** um jogo ainda não iniciado, **When** o diretor escolhe os titulares e dá o apito na tela nova, **Then** o relógio da parte começa a contar, exatamente como no "Jogo ao vivo" de hoje.
2. **Given** um jogo a decorrer na tela nova, **When** o diretor faz uma substituição (tocando no suplente e depois na linha de quem sai), **Then** o jogador que sai deixa de acumular minutos e o que entra passa a acumular, e a troca aparece no registo cronológico do jogo.
3. **Given** um jogo a decorrer, **When** o diretor inicia um pedido de tempo e depois termina-o, **Then** o tempo da pausa é descontado dos minutos de quem estava em quadra, exatamente como hoje; se o motivo for "outro" (não pedido de tempo), ninguém perde minutos.
4. **Given** uma parte a decorrer, **When** o diretor termina a parte (e, se for a última, o jogo), **Then** o estado do jogo fica igual ao que ficaria se essas ações tivessem sido feitas em "Jogo ao vivo".
5. **Given** o jogo todo registado só pela tela nova, **When** alguém abre o Resumo do jogo depois, **Then** golos, cartões, faltas, substituições e minutos por atleta aparecem corretos — sem nenhuma diferença por terem sido registados nesta tela em vez da antiga.

---

### User Story 2 - O diretor marca a zona de um remate, golo, falta ou defesa sem perder velocidade (Priority: P2)

Depois de marcar o resultado de um lance (remate, golo, falta cometida/sofrida, defesa do guarda-redes), o diretor tem a opção rápida de indicar em que zona do campo aconteceu — a mesma escala de 12 zonas já usada hoje para golos — sem que isso atrase ou bloqueie o próximo lance.

**Why this priority**: Enriquece os dados que a User Story 1 já captura, mas não é essencial pra a tela funcionar — o diretor já consegue registar o jogo todo sem marcar zona nenhuma. Fica depois da autossuficiência de propósito.

**Independent Test**: Marcar um remate, um golo, uma falta cometida, uma falta sofrida e uma defesa do guarda-redes; para cada um, confirmar que aparece a opção de escolher zona (grelha simples de 12 números) e que saltar essa escolha não impede o lance de já estar registado.

**Acceptance Scenarios**:

1. **Given** um remate acabado de marcar, **When** o diretor escolhe uma zona na grelha, **Then** a zona fica associada a esse remate.
2. **Given** o mesmo remate, **When** o diretor toca em "saltar" em vez de escolher uma zona, **Then** o remate continua registado normalmente, só sem zona.
3. **Given** uma falta sofrida marcada, **When** o diretor escolhe a zona, **Then** essa zona representa tanto o local da falta como o do livre que resulta dela — não há escolha separada para o livre.

---

### User Story 3 - O diretor marca o contexto tático da equipa sem atrapalhar a marcação de remates (Priority: P3)

Além das ações de cada jogador, o diretor consegue marcar informação da equipa como um todo — em que fase de jogo está (organização ofensiva/defensiva, transição), uma transição com a vantagem numérica que ela gerou, perdas/recuperações de bola, bola parada ganha a favor ou contra, o guarda-redes a jogar como jogador de linha (goleiro-linha), e ações defensivas genéricas — sem que isso compita visualmente com a marcação de remates, que continua a ser a ação mais frequente.

**Why this priority**: É informação tática valiosa, mas a tela já entrega valor real com só as User Stories 1 e 2. Esta soma contexto que enriquece a análise pós-jogo, principalmente a User Story 4.

**Independent Test**: Durante um jogo de teste, marcar pelo menos uma mudança de fase de jogo, uma transição (com a vantagem numérica escolhida), uma perda e uma recuperação de bola, e confirmar que todas ficam registadas sem exigir escolher um jogador específico (exceto quando o diretor optar por atribuir, quando essa opção existir).

**Acceptance Scenarios**:

1. **Given** o diretor muda a fase de jogo ativa, **When** essa mudança é marcada, **Then** fica registada como um acontecimento no tempo (não só um estado que se perde depois).
2. **Given** uma transição ofensiva, **When** o diretor marca "ganha" ou "perdida", **Then** é obrigado a escolher a vantagem numérica (ex. "3x1") antes de o lance ficar registado — não dá para confirmar uma transição sem essa informação.
3. **Given** uma transição a ser marcada, **When** o diretor termina de a marcar, **Then** não aparece nenhuma opção de atribuir a um jogador específico (ao contrário dos outros eventos de equipa).
4. **Given** uma perda, recuperação, bola parada ganha, ou ação defensiva a ser marcada, **When** o diretor confirma, **Then** tem a opção (não obrigatória) de atribuir esse lance a um jogador específico.
5. **Given** o guarda-redes a jogar como goleiro-linha, **When** o diretor marca o início dessa situação, **Then** fica registado como um período (com início e fim), não como um evento isolado — e isso não altera sozinho quem está listado em quadra.

---

### User Story 4 - O treinador vê, depois do jogo, as transições ofensivas desperdiçadas com vantagem numérica (Priority: P4)

Depois do jogo, o treinador consegue ver uma lista das transições ofensivas que a equipa teve com vantagem numérica real (ex. 3x1, 2x1) mas que não chegaram sequer a um remate — o alerta de coaching que motivou registar a vantagem numérica de cada transição.

**Why this priority**: É o motivo real de existir o campo de vantagem numérica na User Story 3, mas só faz sentido depois de haver dados suficientes capturados — é a entrega que fecha o ciclo "captura → informação útil", mas pode vir depois das primeiras três sem perder valor imediato (o diretor já consegue usar a tela sem isto).

**Independent Test**: Com um jogo de teste que tenha pelo menos uma transição ofensiva perdida com vantagem numérica real e uma com igualdade/desvantagem, confirmar que só a primeira aparece na lista de transições desperdiçadas.

**Acceptance Scenarios**:

1. **Given** um jogo com transições ofensivas marcadas, **When** o treinador consulta a lista de transições desperdiçadas, **Then** só aparecem as que foram "perdidas" E tinham vantagem numérica real (não as de igualdade ou desvantagem numérica).
2. **Given** uma transição ofensiva "ganha" (chegou a remate) com vantagem numérica, **When** o treinador consulta essa lista, **Then** essa transição não aparece — só as perdidas contam como desperdício.

---

### Edge Cases

- O estado de "goleiro-linha ativo" é só informativo — não força nenhuma substituição nem muda quem está listado em quadra; o guarda-redes continua a ser um dos 5 jogadores em quadra, só com outro papel tático.
- Um cartão vermelho continua a retirar o jogador de quadra, com o mesmo efeito que já tem hoje — esta tela não muda essa regra.
- Se o diretor esquecer de terminar uma pausa antes de terminar a parte, o comportamento é o mesmo que já existe hoje (a pausa fecha-se sozinha ao terminar a parte).
- Um remate/golo marcado sem nenhuma transição, recuperação ou fase de jogo ativa recente não tem nenhuma origem para derivar automaticamente — o diretor escolhe o tipo à mão nesse caso, exatamente como já faz hoje para um golo.
- A equipa adversária atinge a 5ª falta acumulada da parte — mesmo aviso que já existe hoje; a 6ª falta é o limiar real da sanção (livre direto de 10m sem barreira).

## Requirements *(mandatory)*

### Functional Requirements

**Autossuficiência (User Story 1)**

- **FR-001**: A nova tela DEVE permitir escolher os titulares e dar o apito inicial de cada parte, com o mesmo efeito que a tela "Jogo ao vivo" já produz hoje.
- **FR-002**: A nova tela DEVE permitir substituições, com o jogador que sai a parar de acumular minutos e o que entra a começar, exatamente como hoje.
- **FR-003**: A nova tela DEVE permitir iniciar e terminar uma pausa (pedido de tempo ou outro motivo), com o mesmo efeito sobre os minutos de quem está em quadra que já existe hoje (só pedido de tempo desconta; outro motivo não).
- **FR-004**: A nova tela DEVE permitir terminar a parte e, quando for a última, terminar o jogo.
- **FR-005**: O diretor NUNCA DEVE precisar de abrir a tela "Jogo ao vivo" durante um jogo registado pela tela nova.
- **FR-006**: A nova tela DEVE continuar a permitir marcar golo, cartão amarelo/vermelho, falta cometida/sofrida e atendimento, com o mesmo resultado que a tela "Jogo ao vivo" já produz.

**Captura por jogador e zona (User Story 2)**

- **FR-007**: Cada jogador em quadra DEVE ter a sua própria área de ações na tela, de forma que qualquer lance marcado nessa área fique automaticamente atribuído a esse jogador, sem precisar de um passo extra de "escolher quem".
- **FR-008**: Um jogador de linha DEVE poder marcar um remate com um dos 4 resultados: golo, defendido, fora, ou bloqueado.
- **FR-009**: O guarda-redes NÃO DEVE ter a opção de marcar remate — em vez disso, DEVE poder marcar defesas e situações de 1x1 (saídas).
- **FR-010**: Depois de marcar um remate, golo, falta cometida, falta sofrida, ou defesa, o diretor DEVE ter a opção (nunca obrigatória) de indicar a zona do campo onde aconteceu, usando a mesma escala de 12 zonas já usada para golos hoje.
- **FR-011**: Saltar a escolha de zona NUNCA DEVE impedir ou atrasar o registo do lance principal.

**Painel de equipa (User Story 3)**

- **FR-012**: A tela DEVE ter uma área própria, tão visível quanto a área dos jogadores, para marcar eventos que pertencem à equipa como um todo, não a um jogador específico.
- **FR-013**: O diretor DEVE poder marcar a fase de jogo ativa da equipa (organização ofensiva, organização defensiva, transição ataque→defesa, transição defesa→ataque); cada mudança DEVE ficar registada como um acontecimento no tempo, não só como um estado atual que se perde.
- **FR-014**: O diretor DEVE poder marcar uma transição, indicando a direção (ofensiva/defensiva), o resultado (ganha/perdida) e a vantagem numérica (ex. "3x1") — os três são obrigatórios para confirmar o lance.
- **FR-015**: Uma transição NUNCA DEVE oferecer a opção de atribuir a um jogador específico.
- **FR-016**: O diretor DEVE poder marcar perda e recuperação de bola, bola parada ganha a favor ou contra (por tipo), e ações defensivas genéricas — cada um com a opção, nunca obrigatória, de atribuir a um jogador específico.
- **FR-017**: O diretor DEVE poder marcar o início e o fim de uma situação de goleiro-linha (guarda-redes a jogar como jogador de linha), como um período com duração, não como um evento isolado.
- **FR-018**: Quando o tipo de origem de um remate/golo (organização, transição, ataque rápido) já é dedutível de um evento marcado imediatamente antes (uma transição ganha, uma recuperação, ou a fase ativa), o sistema DEVE preencher esse tipo automaticamente, mostrando o valor escolhido de forma visível e corrigível, em vez de pedir ao diretor para o escolher de novo. Tipos de bola parada continuam sempre a exigir escolha manual.

**Relatório de transições desperdiçadas (User Story 4)**

- **FR-019**: O sistema DEVE permitir consultar, depois do jogo, a lista de transições ofensivas marcadas como "perdidas" cujo valor de vantagem numérica representa uma vantagem real (não igualdade nem desvantagem numérica).
- **FR-020**: Transições "ganhas", ou com igualdade/desvantagem numérica, NUNCA DEVEM aparecer nessa lista.
- **FR-021**: Todos os novos tipos de lance capturados por esta tela (remate, perda, recuperação, transição, defesa, saída, fase de jogo, bola parada ganha, ações defensivas, goleiro-linha) DEVEM aparecer no Resumo do jogo, na Timeline exportável e na tela de corrigir registo, da mesma forma que os tipos de lance já existentes aparecem hoje.

**Fora de escopo nesta entrega**

- Esta entrega não cria nenhum novo tipo de aviso visual para a falta acumulada — o aviso já existente a partir da 5ª falta mantém-se; qualquer reforço visual específico para a 6ª falta fica para uma iteração futura.
- Esta entrega não introduz nenhum campo de "vantagem numérica" fora do contexto de transição (ex. após cartão vermelho).

### Key Entities

- **Remate**: um lance de um jogador de linha que termina em golo, defesa do guarda-redes adversário, fora, ou bloqueio — com zona e tipo de origem opcionais.
- **Transição**: um lance de equipa com direção (ofensiva/defensiva), resultado (ganha/perdida) e vantagem numérica — nunca atribuído a um jogador.
- **Fase de jogo**: o estado tático ativo da equipa num dado momento, registado como uma sequência de mudanças ao longo do tempo.
- **Goleiro-linha**: um período (início/fim) em que o guarda-redes está a jogar como jogador de linha.
- **Transição desperdiçada**: uma transição ofensiva perdida com vantagem numérica real — conceito derivado para o relatório pós-jogo (User Story 4), não um dado guardado à parte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um diretor consegue registar um jogo inteiro (apito ao fim) usando só a tela nova, sem nunca precisar de abrir a tela "Jogo ao vivo".
- **SC-002**: Depois de um jogo registado só pela tela nova, o Resumo do jogo mostra golos, cartões, faltas, substituições e minutos por atleta corretos, sem nenhuma diferença do que mostraria se tivesse sido registado pela tela antiga.
- **SC-003**: Marcar o resultado de um remate (sem zona) é tão rápido quanto marcar um cartão hoje — um toque, sem ecrã intermédio.
- **SC-004**: Um treinador consegue identificar, depois do jogo, quantas transições ofensivas com vantagem numérica real a equipa desperdiçou, sem precisar de rever o jogo manualmente.

## Assumptions

- O diretor é o único a escrever no jogo ao vivo em qualquer momento — não há cenário de dois dispositivos a editar o mesmo jogo ao mesmo tempo que esta funcionalidade precise de tratar de forma diferente do que já existe hoje.
- A escala de zona reaproveita exatamente a mesma de 12 zonas já usada para golos (`ZONAS_GOLO`) — não cria nenhuma escala nova nem nenhum desenho espacial do campo.
- O dispositivo usado é um ecrã largo (tablet, ou telemóvel em modo horizontal) — não telemóvel em modo vertical.
- O acesso à tela nova reaproveita exatamente a mesma permissão de hoje para "Jogo ao vivo" (as contas `team_admin`/`data_entry`) — não cria nenhum conceito de acesso próprio para o papel de "diretor".
- Os novos tipos de lance (remate, posse, transição, fase de jogo, bola parada ganha, ações defensivas, goleiro-linha) precisam de aparecer no Resumo do jogo, na Timeline exportável e na tela de corrigir registo já nesta entrega — captura sem exibição não entrega valor nenhum. A lista de transições desperdiçadas (User Story 4) faz parte desta mesma entrega, não de uma seguinte.
