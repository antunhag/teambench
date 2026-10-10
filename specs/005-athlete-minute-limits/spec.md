# Feature Specification: Limites de minutos por atleta, desacoplados da confiança

**Feature Branch**: `005-athlete-minute-limits`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Controles de tempo desejado (máximo de minutos e máximo de minutos consecutivos) por atleta, por jogo, desacoplados da confiança — Teambench."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Limitar o total de minutos de um atleta claramente melhor, mas desgastado (Priority: P1)

O treinador tem um atleta que é claramente o mais apto numa vaga (ex.: Pivô), mas que precisa jogar menos minutos no total naquele jogo específico por gestão de desgaste físico — não porque exista alguém melhor. Hoje o único controle disponível é a confiança por vaga, que afeta quem entra em quadra mas não quanto tempo total esse atleta especificamente recebe: mesmo reduzindo a confiança, isso degrada a qualidade da escalação (abre espaço pra atletas sem aptidão real) em vez de simplesmente limitar o tempo de quem já é o melhor. O treinador define um máximo de minutos pra esse atleta, pra este jogo, e os 3 planos gerados respeitam esse teto sem rebaixar a confiança real do atleta nas vagas em que ele continua sendo escalado.

**Why this priority**: É o caso relatado e comprovado numa sessão real com dados do plantel (Cartucho, Pivô) — sem isso, o gerador automático produz planos que o treinador não pode usar como estão, obrigando-o a editar manualmente turno a turno depois de cada geração, o que anula o valor da geração automática.

**Independent Test**: Configurar um máximo de minutos pra um atleta com confiança alta numa vaga, gerar as 3 opções, e confirmar que o total de minutos desse atleta em cada uma das 3 opções nunca ultrapassa o máximo definido — mesmo que sua confiança continue a mais alta da vaga.

**Acceptance Scenarios**:

1. **Given** um atleta com confiança 5 (muita confiança) numa vaga e nenhum outro atleta com confiança comparável, **When** o treinador define um máximo de 20 minutos pra esse atleta e gera as 3 opções, **Then** nenhuma das 3 opções atribui mais que 20 minutos totais a esse atleta, e a vaga continua coberta até o fim de cada parte por outros atletas elegíveis.
2. **Given** um atleta sem nenhum máximo de minutos definido, **When** o treinador gera as 3 opções, **Then** o comportamento de geração pra esse atleta é idêntico ao que já existe hoje (nenhuma mudança).
3. **Given** um máximo de minutos já definido pra um atleta, **When** o treinador remove o valor (deixa em branco), **Then** esse atleta volta a ser tratado sem limite, igual ao comportamento atual.

---

### User Story 2 - Definir o próprio teto de minutos consecutivos de cada atleta (Priority: P2)

O treinador tem atletas com necessidades bem diferentes de duração de turno: um "titular natural" que precisa de turnos mais curtos que a maioria por gestão de carga física (ex.: Rodrigo M, Ala Direita), e outros que podem perfeitamente ficar mais tempo seguido sem problema. Hoje todo atleta compartilha exatamente o mesmo teto de 5 minutos contínuos numa vaga, igual em todas as 3 opções geradas, sem exceção — um valor fixo do sistema, não uma decisão por atleta. O treinador define, por atleta, pra este jogo, o máximo de minutos consecutivos que esse atleta específico deve ficar na mesma vaga — podendo ser menor OU maior que o valor usado hoje, conforme a necessidade real de cada um. Atletas sem valor definido continuam usando o padrão atual do sistema.

**Why this priority**: Resolve um segundo caso real relatado (Rodrigo M, Ala Direita) na mesma conversa, e corrige uma suposição da geração atual (Decisão 8, `specs/004-rotation-plan-generation/research.md`) de que um único valor fixo serve igualmente bem pra qualquer atleta — na prática, o treinador quer decidir isso atleta a atleta. Depende do mesmo mecanismo de dados por atleta/jogo da User Story 1, mas é uma dimensão diferente (duração por turno, não total de minutos), por isso prioridade P2, não P1.

**Independent Test**: Configurar valores de máximo de minutos consecutivos diferentes pra dois atletas distintos (um menor e um maior que o padrão atual do sistema), gerar as 3 opções, e confirmar que cada atleta respeita o SEU PRÓPRIO valor configurado, nas 3 opções, independentemente do valor do outro atleta ou do padrão do sistema.

**Acceptance Scenarios**:

1. **Given** um atleta com máximo de minutos consecutivos definido menor que o padrão atual do sistema, **When** o treinador gera as 3 opções, **Then** nenhum turno contínuo desse atleta na mesma vaga ultrapassa o valor definido, em nenhuma das 3 opções.
2. **Given** um atleta com máximo de minutos consecutivos definido maior que o padrão atual do sistema, **When** o treinador gera as 3 opções, **Then** esse atleta pode ficar até o valor definido numa mesma vaga, mesmo que isso ultrapasse o que outros atletas sem valor configurado conseguem.
3. **Given** um atleta sem máximo de minutos consecutivos definido, **When** o treinador gera as 3 opções, **Then** esse atleta continua sujeito ao valor padrão do sistema, igual ao comportamento atual.

---

### User Story 3 - Confiar que os limites valem igualmente nas 3 opções geradas (Priority: P3)

O treinador define limites de minutos (totais e/ou consecutivos) pra um ou mais atletas, e quer ter certeza de que essas restrições são genuinamente respeitadas em QUALQUER uma das 3 opções que escolher — não só na opção padrão. Isso importa porque o treinador pode preferir "Foco nos mais aptos" num jogo e "Dá minutos a todos" noutro, e os limites de gestão de desgaste de um atleta específico não podem depender de qual filosofia de rotação foi escolhida.

**Why this priority**: É uma garantia de confiabilidade sobre as duas funcionalidades centrais (P1/P2) — sem ela, o treinador precisaria verificar manualmente cada opção antes de escolher, o que reduz a confiança na geração automática. Prioridade P3 porque é uma propriedade transversal, não uma capacidade nova isolada.

**Independent Test**: Configurar limites pra múltiplos atletas simultaneamente (alguns só com máximo de minutos, alguns só com máximo de minutos consecutivos, alguns com ambos), gerar as 3 opções, e verificar que todos os limites são respeitados nas 3, não só numa.

**Acceptance Scenarios**:

1. **Given** múltiplos atletas com limites diferentes configurados (alguns só máximo de minutos, alguns só máximo de minutos consecutivos, alguns com ambos), **When** o treinador gera as 3 opções, **Then** todos os limites configurados são respeitados nas 3 opções simultaneamente, sem exceção pra nenhuma das 3 filosofias de rotação.

---

### Edge Cases

- Quando o máximo de minutos (ou de minutos consecutivos) de um ou mais atletas torna matematicamente impossível cobrir uma vaga até o fim de uma parte (ex.: só existem 2 atletas elegíveis pra uma vaga e a soma dos seus máximos não cobre a duração da parte), a geração é recusada com um erro claro explicando qual vaga/período é impossível de cobrir com os limites atuais — o sistema nunca entrega um plano com vaga descoberta silenciosamente (Clarificação 1).
- O que acontece se o treinador definir um máximo de minutos totais menor que o tempo mínimo de uma janela de decisão do sistema (hoje 5 minutos)? O atleta deve ainda assim poder entrar por uma janela parcial, ou nunca ser escalado?
- O que acontece se o treinador definir um máximo de minutos consecutivos e um máximo de minutos totais pro mesmo atleta, e os dois entrarem em conflito entre si (ex.: o máximo de minutos consecutivos, aplicado repetidamente, permitiria mais tempo total que o máximo de minutos definido)? O máximo de minutos totais deve sempre prevalecer como teto final, independente de quantos turnos o atleta acumule.
- Um atleta que atinge seu máximo de minutos totais no meio da 1ª parte fica indisponível para o resto do jogo inteiro, incluindo a 2ª parte — o máximo é sobre o jogo todo, não reinicia por parte (Clarificação 2).
- Um atleta com máximo de minutos consecutivos configurado maior que o padrão do sistema (ex.: 15 min) ainda assim nunca ultrapassa seu próprio máximo de minutos TOTAIS, se também tiver um definido — os dois limites coexistem, o de minutos totais sempre vence como teto final.
- Um valor de máximo de minutos consecutivos que não seja múltiplo do tamanho da janela de decisão do sistema (hoje 5 minutos) produz o mesmo efeito prático do múltiplo imediatamente abaixo — ex.: configurar 7 min tem o mesmo resultado prático que configurar 5 min, já que o sistema só reavalia quem ocupa cada vaga nos limites da janela.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE permitir ao treinador definir um máximo de minutos por atleta, por jogo, independente da confiança por vaga desse atleta.
- **FR-002**: O sistema DEVE permitir ao treinador definir um máximo de minutos consecutivos por atleta, por jogo, independente da confiança por vaga desse atleta.
- **FR-003**: Ambos os limites (máximo de minutos e máximo de minutos consecutivos) DEVEM ser opcionais — um atleta sem nenhum valor definido mantém o comportamento de geração já existente, sem nenhuma mudança.
- **FR-004**: Os limites definidos DEVEM valer apenas para o jogo em que foram configurados, nunca alterando o cadastro permanente do atleta (mesmo princípio já aplicado à confiança por vaga, Decisão 5 em `specs/004-rotation-plan-generation/research.md`).
- **FR-005**: O sistema DEVE permitir que o máximo de minutos consecutivos configurado para um atleta seja MENOR ou MAIOR que o valor padrão usado hoje (5 minutos) — não existe mais um teto superior fixo imposto pelo sistema por cima do valor escolhido pelo treinador; cada atleta configurado tem o seu próprio teto (Clarificação 3, revisa a Decisão 8 de `specs/004-rotation-plan-generation/research.md`, que tratava 5 minutos como teto absoluto e igual pra todos).
- **FR-006**: As 3 opções de plano geradas (qualquer que seja a filosofia de rotação escolhida) DEVEM respeitar igualmente os limites de minutos totais e consecutivos configurados — nenhuma das 3 opções pode ultrapassar um limite configurado para um atleta.
- **FR-007**: Quando um atleta atinge seu máximo de minutos totais configurado, o sistema DEVE parar de escalá-lo em qualquer vaga pelo restante do jogo (incluindo partes seguintes), mesmo que sua confiança continue sendo a mais alta disponível para uma vaga.
- **FR-008**: Quando os limites configurados tornam matematicamente impossível cobrir uma vaga até o fim de uma parte, o sistema DEVE recusar a geração e mostrar um erro claro ao treinador, identificando qual vaga e período ficariam sem cobertura — nunca deve entregar silenciosamente um plano com uma vaga descoberta (Clarificação 1).
- **FR-009**: O máximo de minutos totais configurado para um atleta DEVE se aplicar ao jogo inteiro (soma de todas as partes), não separadamente a cada parte (Clarificação 2).
- **FR-010**: A interface de configuração do máximo de minutos consecutivos DEVE ser um campo numérico de minutos, já que o valor pode agora ser menor ou maior que o padrão atual do sistema (Clarificação 3) — um valor que não seja múltiplo do tamanho da janela de decisão do sistema produz o mesmo efeito prático do múltiplo imediatamente abaixo, e isso deve ficar claro pro treinador no momento de configurar (ex.: texto de apoio), não escondido.
- **FR-011**: A geração DEVE continuar determinística — o mesmo conjunto de confiança, limites de minutos e limites de minutos consecutivos DEVE sempre produzir o mesmo resultado, sem nenhum sorteio (mesmo princípio já estabelecido para a geração atual).
- **FR-012**: O sistema DEVE deixar claro ao treinador, na tela de configuração, quais atletas têm limites de minutos ou minutos consecutivos ativos para o jogo atual, distinguindo visualmente de atletas sem nenhum limite configurado.
- **FR-013**: Quando nenhum valor de máximo de minutos consecutivos é configurado para um atleta, o sistema DEVE continuar aplicando o valor padrão já usado hoje (5 minutos) — a mudança desta feature é permitir uma escolha explícita por atleta, não remover o comportamento padrão de quem não configura nada.

### Key Entities *(include if feature involves data)*

- **Limite de minutos do atleta no jogo**: por atleta, por jogo — um máximo de minutos totais (opcional) e um máximo de minutos consecutivos (opcional), ambos independentes da confiança por vaga já existente. Vale só para aquele jogo específico, nunca altera o cadastro permanente do atleta (mesmo padrão de escopo já usado pela confiança por vaga em `rotation_plan_weights`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um atleta com máximo de minutos configurado nunca recebe mais tempo total que o configurado, em nenhuma das 3 opções geradas, em 100% das gerações testadas.
- **SC-002**: Um atleta com máximo de minutos consecutivos configurado (menor ou maior que o padrão do sistema) nunca fica mais tempo contínuo na mesma vaga que o SEU PRÓPRIO valor configurado, em nenhuma das 3 opções geradas, em 100% das gerações testadas — independente do valor configurado para outros atletas.
- **SC-003**: Um treinador consegue configurar o limite de um atleta específico e ver o efeito refletido nas 3 opções geradas sem precisar editar manualmente nenhum turno depois da geração, para o caso de uso relatado (atleta claramente melhor que precisa de menos tempo por desgaste).
- **SC-004**: Atletas sem nenhum limite configurado continuam recebendo exatamente a mesma escalação que receberiam sem esta funcionalidade — zero regressão no comportamento já existente.

## Assumptions

- O teto de 5 minutos contínuos por vaga, antes tratado como absoluto e igual pra todo mundo (Decisão 8), passa a ser só o PADRÃO usado quando o treinador não configura nada pra um atleta — com esta feature, cada atleta pode ter seu próprio teto, pra cima ou pra baixo, sem limite superior imposto pelo sistema.
- O valor do máximo de minutos (totais e consecutivos) é inserido como um número simples de minutos inteiros (não um campo de horário tipo "mm:ss"), já que o que importa aqui é o total/duração de tempo desejado, não um instante específico do jogo — mais rápido de preencher e consistente com o princípio de simplicidade já estabelecido (Princípio V da constituição).
- Quando os limites configurados tornam a cobertura de alguma vaga matematicamente impossível, a geração é recusada com erro — nunca um plano parcial silencioso (preserva a garantia já existente de "vaga preenchida até o fim da parte").
- O máximo de minutos totais é sempre sobre o jogo inteiro (todas as partes somadas), não reinicia a cada parte.
- Esta entrega não inclui: meta/mínimo de minutos, prioridade de minutos numa escala separada, descanso mínimo entre entradas, pontuação de equilíbrio por bloco de rotação, regras de combinação entre atletas, alertas/explicabilidade textual, versionamento de planos, vagas proibidas como restrição dura separada da confiança, ou regeneração parcial com turnos bloqueados — todos esses itens vieram de um documento de requisitos mais amplo trazido pelo treinador e foram explicitamente adiados para entregas futuras.
- Minutos recentes de jogos anteriores continuam fora da geração do plano completo (só contexto informativo no motor de sugestão do seletor manual, `rotationSuggestion.ts`) — esta feature não muda isso.
