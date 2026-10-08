# Feature Specification: Motor de Sugestão de Rotação Baseado em Dados

**Feature Branch**: `003-data-driven-rotation`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Precisamos de um engine para fazer o planeamento da rotação baseado em dados. Mescla de aptidão, tempo em jogos anteriores, e estado do atleta (lesão, doença, nível de treino, etc.)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sugestão de escalação por vaga, baseada em dados reais (Priority: P1)

Hoje o treinador escolhe cada atleta pra cada turno de cada vaga do zero, só com a classificação A/B/C como texto de apoio no dropdown — nada cruza isso com o estado atual do atleta. Esta funcionalidade cruza aptidão por vaga (fator principal — neste escalão de competição, jogam os melhores) com o estado atual do atleta (apto/a retomar/indisponível), e apresenta uma ORDEM sugerida de quem priorizar em cada vaga, antes de o treinador escolher. Minutos jogados recentemente aparecem como CONTEXTO (quanto um atleta já tem de rodagem), nunca como um fator que inverte a ordem da aptidão — isto não é um sistema de equilibrar quem jogou menos.

**Why this priority**: É o núcleo do pedido — sem isto, as outras fontes de dados (estado do atleta) não têm onde aparecer de forma útil.

**Independent Test**: Ao abrir o planeador de rotação de um jogo de teste, para cada vaga o treinador vê os atletas ordenados primeiro por aptidão (A/B/C, como hoje), com o estado atual de cada um visível e a influenciar quem fica mais acima/abaixo dentro do mesmo nível de aptidão — e escolhe de lá; a escolha final continua sempre dele.

**Acceptance Scenarios**:

1. **Given** um atleta classificado "A" numa vaga mas marcado "Indisponível" (lesão/doença) pro jogo de hoje, **When** o treinador abre o seletor dessa vaga, **Then** esse atleta não aparece como sugestão prioritária, mesmo sendo o de melhor aptidão (ver User Story 2 sobre como o estado é registado).
2. **Given** um atleta classificado "A" numa vaga mas marcado "A retomar" (dosear entrada), **When** o treinador abre o seletor dessa vaga, **Then** esse atleta continua a aparecer (está apto a jogar), mas a sugestão deixa claro que deve ter menos tempo de jogo agora, nunca escondido da lista.
3. **Given** um atleta sem nenhuma classificação numa vaga (nunca avaliado), **When** aparece na lista sugerida dessa vaga, **Then** fica claramente identificado como "sem classificação", nunca sugerido à frente de quem tem classificação real, a não ser que não haja mais ninguém disponível.
4. **Given** um atleta recém-chegado ao plantel, sem nenhum jogo anterior registado, **When** aparece na lista sugerida, **Then** é ordenado pela sua aptidão como qualquer outro atleta — a falta de minutos jogados não o prioriza nem o penaliza (ver FR-006).

---

### User Story 2 - Registar o estado do atleta (Priority: P1)

Não existe hoje nenhum lugar pra dizer "este atleta está lesionado", "está a retomar depois de faltar a treinos" ou "está com gripe, não vem" — esta funcionalidade introduz isso, pra alimentar a sugestão da User Story 1. Faz sentido viver no Plantel (é informação sobre o atleta, não sobre um jogo isolado), não só escondido dentro do planeamento de um jogo específico.

**Why this priority**: Sem isto, a User Story 1 não tem de onde tirar o estado — é pré-requisito direto, não um extra.

**Independent Test**: No Plantel, o treinador marca um atleta como "Indisponível" (lesão prolongada) e outro como "A retomar" (voltou a treinar pouco, mas está apto); ao planear a rotação de um jogo de teste, a sugestão reflete os dois casos de forma diferente.

**Acceptance Scenarios**:

1. **Given** um atleta "Apto" por padrão, **When** o treinador marca "Indisponível" (lesão/doença), **Then** esse atleta deixa de ser sugerido pra entrar em quadra, em qualquer jogo, até o treinador o marcar "Apto" de novo — não precisa de repetir a marcação jogo a jogo.
2. **Given** um atleta "Apto" por padrão, **When** o treinador marca "A retomar" antes de um jogo específico (ex.: voltou de 1-2 treinos perdidos, mas pode jogar), **Then** essa marcação vale só pra esse jogo — o próximo jogo volta a assumir "Apto", a não ser que o treinador marque "A retomar" de novo.
3. **Given** um atleta marcado como "Indisponível" ou "A retomar", **When** o treinador o quer escalar normalmente mesmo assim, **Then** consegue — o estado influencia a sugestão, nunca bloqueia a escolha final do treinador.

---

### User Story 3 - Ver o histórico de minutos que informou a sugestão (Priority: P2)

Pra confiar na sugestão, o treinador precisa conseguir ver RAPIDAMENTE o porquê — não uma pontuação abstrata, mas algo que ele já entende (quantos minutos cada atleta jogou recentemente).

**Why this priority**: Reforça a confiança na User Story 1, mas a sugestão já funciona sem isto ser visível — é refinamento, não bloqueio.

**Independent Test**: Ao ver a lista sugerida de uma vaga, o treinador consegue ver, pra cada atleta, um resumo simples do motivo da posição na lista (ex.: "jogou X min nos últimos jogos").

**Acceptance Scenarios**:

1. **Given** a lista sugerida de uma vaga, **When** o treinador olha pra um atleta nela, **Then** vê uma indicação simples e em português do porquê daquela posição (não um número de pontuação sem contexto).

### Edge Cases

- Um atleta novo no plantel, sem nenhum jogo anterior registado — ordenado só pela aptidão (FR-006), nunca puxado pra cima só por ter zero minutos.
- Todos os atletas aptos pra uma vaga estão "Indisponível" — a sugestão precisa de mostrar isso com clareza, não falhar silenciosamente nem sugerir vazio sem explicação.
- Um jogo de teste/treino que não deve contar pro histórico de minutos (se esse conceito existir) — fora do escopo desta spec; hoje todo jogo registado é "real" pro sistema, isso não muda aqui.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE, para cada vaga fixa (Fixo/Ala Esquerda/Ala Direita/Pivô), apresentar os atletas numa ORDEM sugerida de prioridade, com a classificação A/B/C já existente como fator principal (jogam os melhores) e o estado atual do atleta a afastar/sinalizar quem não deve ser priorizado agora — minutos jogados recentemente aparecem como contexto (FR-004), nunca como fator que inverte a ordem da aptidão.
- **FR-002**: O sistema DEVE permitir ao treinador marcar, no Plantel, o estado de cada atleta entre pelo menos três níveis: Apto (padrão), A retomar (apto a jogar, mas a sugestão deve favorecer menos tempo de jogo), e Indisponível (lesão/doença, não deve ser sugerido pra jogar).
- **FR-003**: A sugestão de prioridade DEVE ser só uma ordenação/recomendação — o treinador CONTINUA a poder escalar qualquer atleta em qualquer vaga, independente da ordem sugerida ou do estado marcado (nunca um bloqueio).
- **FR-004**: O sistema DEVE mostrar, junto de cada atleta na lista sugerida, uma explicação simples e em português de por que está naquela posição (aptidão, estado, e/ou contexto de minutos recentes).
- **FR-005**: Um atleta sem classificação numa vaga (nunca avaliado) DEVE aparecer identificado como tal, nunca sugerido à frente de atletas com classificação real nessa vaga, salvo se não houver mais ninguém apto.
- **FR-006**: Um atleta sem nenhum jogo anterior registado DEVE ser ordenado pela sua classificação de aptidão como qualquer outro atleta — a falta de histórico de minutos NUNCA o prioriza nem o penaliza; minutos jogados servem só de contexto de maturação (FR-004), nunca de fator que compete com a aptidão.
- **FR-007**: O estado "Indisponível" DEVE persistir entre jogos até o treinador marcar o atleta como "Apto" de novo (uma lesão de várias semanas não exige remarcar antes de cada jogo); o estado "A retomar" DEVE valer só pro próximo jogo planeado, voltando a "Apto" por padrão depois disso (reavaliado pelo treinador a cada jogo, sem ligação a dados de treino que a app não regista).
- **FR-008**: O estado do atleta DEVE poder ser consultado e ajustado a partir do Plantel — é informação sobre o atleta em si, não só sobre um jogo isolado, mesmo sendo usado principalmente dentro do planeamento de rotação.

### Key Entities

- **Estado do atleta**: novo conceito, gerido no Plantel — Apto (padrão) / A retomar (dosear entrada, válido só pro próximo jogo) / Indisponível (lesão/doença, persiste até o treinador reverter). Nunca bloqueia a escolha do treinador, só informa a sugestão.
- **Sugestão de prioridade por vaga**: não é guardada — calculada no momento, a partir de aptidão (já existe, fator principal) + estado do atleta (novo) + minutos jogados recentemente (contexto, já calculável). Nunca substitui a escolha final do treinador, guardada como já é hoje em `rotation_plan_stints`.
- **Histórico de minutos**: agregação, pela primeira vez, dos minutos já calculados por jogo individual, através de vários jogos recentes de um atleta — usado como contexto informativo (FR-004), nunca como fator de ordenação por si só.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao planear a rotação de um jogo, o treinador consegue ver a lista sugerida de cada vaga sem nenhum passo extra (aparece junto do que já existe hoje, não numa tela separada).
- **SC-002**: Um atleta marcado "Indisponível" nunca aparece como sugestão prioritária em nenhum jogo seguinte, sem o treinador precisar remarcar nada.
- **SC-003**: Um atleta marcado "A retomar" continua visível e escalável na vaga, mas a sugestão deixa claro (FR-004) que deve ter menos tempo de jogo agora — nunca desaparece da lista como se estivesse indisponível.
- **SC-004**: O treinador consegue entender o motivo de uma sugestão (SC-001 + FR-004) sem precisar perguntar a alguém técnico o que significa.
- **SC-005**: Um atleta recém-chegado sem jogos anteriores aparece na posição que a sua aptidão justifica, nunca artificialmente primeiro nem último só por falta de histórico.

## Assumptions

- Esta funcionalidade é sobre o planeamento PRÉ-jogo (o `RotationPlanner.tsx` já existente) — o aviso de substituição durante o jogo ao vivo (`upcomingSubAlert`) não muda nesta spec, pode ser revisitado depois se fizer sentido reaproveitar a mesma lógica.
- "Jogos recentes" pro histórico de minutos (contexto, FR-004) considera jogos já terminados desta equipa — a janela exata (últimos 3? 5? toda a época?) fica pra `/speckit-plan` decidir com base no que for tecnicamente simples.
- Esta funcionalidade NÃO é sobre equilibrar minutos entre atletas — neste escalão de competição, jogam os melhores (aptidão manda); minutos jogados nunca competem com a aptidão, só dão contexto de maturação. O item já adiado no roadmap ("Prioridade de uso/desembate na rotação") continua em aberto — esta spec não assume resolvê-lo.
- O desempate exato entre dois atletas na MESMA aptidão (ex.: ambos "A" na mesma vaga) não é uma regra de negócio fixada nesta spec — fica pro `/speckit-plan` propor algo técnico razoável, já que não é o foco do pedido original.
- Não há mudança de papéis/permissões — quem já pode editar o Plantel e o planeador de rotação (Admin da Equipa) continua sendo quem marca o estado dos atletas e vê as sugestões.
- O estado "A retomar"/"Indisponível" não está ligado a nenhum registo de presença em treinos — a app não tem esse conceito hoje, e esta spec não o introduz; é o treinador quem avalia e marca o estado diretamente.
