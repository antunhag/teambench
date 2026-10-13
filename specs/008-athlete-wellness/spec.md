# Feature Specification: Módulo de bem-estar/prontidão do atleta

**Feature Branch**: `008-athlete-wellness`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Módulo de bem-estar/prontidão do atleta (pré/pós-treino) — primeiro passo do Teambench como ERP de clube, não só registo de jogo. Questionário curto preenchido pelo próprio atleta (não pelo staff), em torno de cada treino — exemplos: horário que dormiu, horário que acordou, como sentiu o treino anterior. Consentimento dos encarregados de educação obtido pelo clube fora do app. Login do atleta por email ou PIN/código."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O atleta entra na própria conta, isolada da do resto da equipa (Priority: P1)

Um atleta do plantel consegue entrar no Teambench com uma identidade própria — por email (mesmo fluxo de link mágico já usado pelo resto da app) ou por PIN/código — e, uma vez dentro, só vê informação que é dele: nunca o plantel completo, o calendário de gestão, ou qualquer resposta de outro colega.

**Why this priority**: É a base de tudo o resto desta funcionalidade. O plantel é Sub-15 (menores de idade) — sem este isolamento garantido primeiro, não há módulo nenhum que se possa construir em cima com segurança. Nenhuma outra user story faz sentido entregar antes desta.

**Independent Test**: Criar acesso de atleta para um atleta de teste, entrar com ele (por email e, separadamente, por PIN/código) e confirmar que a navegação disponível não inclui nenhuma tela de gestão da equipa nem dados de outro atleta — mesmo tentando aceder diretamente.

**Acceptance Scenarios**:

1. **Given** um atleta com acesso configurado, **When** entra usando o método de email, **Then** vê só o seu próprio espaço, nunca o plantel completo ou outras telas de gestão.
2. **Given** o mesmo atleta, **When** entra usando PIN/código em vez de email, **Then** chega ao mesmo espaço pessoal, com o mesmo isolamento.
3. **Given** dois atletas da mesma equipa com acesso configurado, **When** um deles está autenticado, **Then** não há nenhuma forma de ver ou aceder aos dados do outro atleta.

---

### User Story 2 - O atleta regista como se sente em torno do treino (Priority: P2)

Já dentro da própria conta, o atleta preenche, uma vez por dia (tipicamente de manhã — cobre o sono da noite e como sentiu o treino do dia anterior, não um formulário separado antes e outro depois de cada treino), um questionário curto com: hora que foi dormir, hora que acordou, qualidade do sono (numa escala) e sensação/fadiga do treino anterior (numa escala) — sem precisar de ajuda do staff para o fazer.

**Why this priority**: É o valor concreto desta funcionalidade — os dados que o clube quer passar a ter. Só faz sentido depois da User Story 1 garantir que o atleta consegue entrar em segurança na própria conta.

**Independent Test**: Com um atleta autenticado (US1), preencher o questionário e confirmar que a resposta fica guardada associada a esse atleta e a essa data/sessão, sem intervenção de nenhum membro do staff.

**Acceptance Scenarios**:

1. **Given** um atleta autenticado na própria conta, **When** preenche o questionário de bem-estar, **Then** a resposta fica guardada, associada a ele e à data/momento certos.
2. **Given** um atleta que já preencheu o questionário de hoje, **When** tenta preencher de novo no mesmo dia, **Then** o sistema reconhece que já existe uma resposta para hoje (não cria uma segunda resposta solta para o mesmo dia).
3. **Given** um atleta que ainda não preencheu o questionário hoje, **When** abre o seu espaço, **Then** vê claramente que o questionário de hoje está por preencher.

---

### User Story 3 - O staff consulta o bem-estar dos atletas da equipa (Priority: P3)

O treinador ou o diretor responsável consegue consultar, dentro do Teambench, a informação de bem-estar que os atletas da sua equipa foram preenchendo — sem precisar de nenhuma ferramenta externa para juntar essa informação.

**Why this priority**: É o que torna o esforço do atleta (US2) útil pra equipa técnica — sem isto, os dados são recolhidos mas nunca chegam a informar nenhuma decisão. Depende das duas anteriores já existirem.

**Independent Test**: Com respostas já preenchidas por pelo menos um atleta de teste (US2), um membro do staff com acesso à equipa abre a tela correspondente e confirma que consegue ver essa informação.

**Acceptance Scenarios**:

1. **Given** respostas de bem-estar já preenchidas por atletas da equipa, **When** um membro do staff com acesso abre a tela de bem-estar, **Then** vê primeiro um resumo/alerta da equipa (ex.: quantos atletas dormiram mal, quantos ainda não preencheram hoje), com acesso a partir daí ao detalhe das respostas de cada atleta individualmente.
2. **Given** um atleta de outra equipa (fora da equipa do staff em questão), **When** esse staff consulta a tela de bem-estar, **Then** não vê nenhuma informação desse atleta — mesmo isolamento por equipa já usado no resto da app.

---

### Edge Cases

- O que acontece quando um atleta do plantel ainda não tem acesso configurado (encarregado de educação ainda não confirmou, ou o staff ainda não criou o acesso)? O plantel continua a funcionar normalmente para tudo o resto; só não há questionário disponível para esse atleta ainda.
- Um atleta deixa de ser `active` no plantel (saiu da equipa) — o acesso próprio dele deve parar de funcionar; as respostas já preenchidas continuam a existir como histórico, não são apagadas.
- Um atleta esquece o PIN/código ou perde o acesso ao email usado — precisa de uma forma de recuperar o acesso sem depender de recriar a conta do zero.
- Um atleta muda de ideia sobre uma resposta já dada no mesmo dia (ex.: percebe que errou a hora que acordou) — precisa de conseguir corrigir antes do dia acabar, não ficar preso à primeira resposta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um atleta se autentique com uma identidade própria, distinta das contas de staff da equipa (`team_admin`/`data_entry`/`viewer`).
- **FR-002**: A autenticação do atleta MUST suportar tanto entrada por email (reaproveitando o mesmo mecanismo de link mágico/código já usado pelo resto da app) quanto por PIN/código — as duas opções têm de estar disponíveis, não apenas uma.
- **FR-003**: Um atleta autenticado MUST só conseguir ver e preencher as suas próprias respostas de bem-estar — nunca as de outro atleta, mesmo da mesma equipa.
- **FR-004**: Um atleta autenticado MUST só conseguir aceder ao seu próprio espaço (questionário de bem-estar e o que vier a ser necessário para isso) — nunca às telas de gestão da equipa (Plantel, Calendário, Formato de Jogo, Acesso à Equipa, Jogo ao vivo).
- **FR-005**: O questionário de bem-estar MUST capturar, para v1, uma lista fechada e curta de campos: hora que foi dormir, hora que acordou, qualidade do sono (escala) e sensação/fadiga do treino anterior (escala) — não um formulário configurável pelo clube nesta entrega.
- **FR-005a**: O atleta MUST preencher no máximo um questionário por dia — uma segunda tentativa no mesmo dia edita a resposta já existente desse dia, nunca cria uma resposta duplicada.
- **FR-006**: Um membro do staff (`team_admin`/`data_entry`) com acesso à equipa MUST conseguir consultar, primeiro, um resumo/alerta agregado do estado da equipa (ex.: quantos atletas dormiram mal, quantos ainda não preencheram hoje) e, a partir daí, o detalhe das respostas de cada atleta individualmente — nunca de atletas de outra equipa.
- **FR-007**: O sistema NÃO DEVE modelar nem bloquear nenhum fluxo de consentimento digital dos encarregados de educação — esse consentimento é assumido como já obtido, por via externa ao app, sempre que um acesso de atleta é criado.
- **FR-008**: Só o próprio atleta MUST poder criar/preencher as suas respostas de bem-estar — o staff pode consultar, mas nunca preencher ou editar em nome de um atleta.
- **FR-009**: Cada resposta de bem-estar MUST ficar associada a uma data/momento identificável, para permitir ver a evolução ao longo do tempo, não só o estado mais recente.

### Key Entities

- **Acesso de atleta**: liga um atleta já existente no plantel a uma identidade de autenticação própria (email ou PIN/código). Hoje este vínculo não existe — o plantel é só um registo gerido pelo staff, sem nenhuma conta associada. Pressupõe que o consentimento do encarregado de educação já foi obtido fora do app antes de este acesso ser criado.
- **Resposta de bem-estar**: um registo pertencente a um único atleta, no máximo um por dia, com: hora que foi dormir, hora que acordou, qualidade do sono (escala) e sensação/fadiga do treino anterior (escala). Nunca editável por outra pessoa que não o próprio atleta; consultável pelo staff da mesma equipa, tanto em resumo agregado quanto em detalhe por atleta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um atleta consegue entrar na própria conta e preencher o questionário de bem-estar em menos de 1 minuto, em qualquer um dos dois métodos de acesso.
- **SC-002**: Em nenhum cenário de teste um atleta consegue ver dados de outro atleta ou aceder a uma tela de gestão da equipa usando a própria conta.
- **SC-003**: Um membro do staff consegue, sem sair do Teambench, perceber de relance quantos atletas da equipa já preencheram o questionário hoje e quantos tiveram um sono/sensação ruim, e chegar ao detalhe de um atleta específico em poucos toques.
- **SC-004**: Um atleta que saiu da equipa deixa de conseguir entrar na própria conta, sem que isso apague o histórico já preenchido.

## Assumptions

- O consentimento dos encarregados de educação é obtido pelo próprio clube, fora do Teambench, como parte de uma iniciativa/comunicação já decidida pelo clube — esta funcionalidade não constrói nem depende de nenhum fluxo de consentimento digital.
- O atleta pode preencher o questionário tanto num aparelho pessoal (telemóvel próprio) quanto num aparelho partilhado do clube — é essa a razão de suportar email e PIN/código em vez de escolher só um.
- Este é o primeiro módulo do Teambench fora do registo de jogo/plantel — a spec não assume nenhuma estrutura comum de "módulos" para funcionalidades futuras que ainda não têm uso real definido; resolve só este caso concreto.
- O detalhe técnico de como o PIN/código é definido e recuperado (por atleta ou por aparelho, fluxo de redefinição) fica para a fase de planeamento, não para esta especificação.
