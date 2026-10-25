# Feature Specification: Captura detalhada de estatísticas (segunda tela de jogo ao vivo)

**Feature Branch**: `009-captura-detalhada`

**Created**: 2026-10-16

**Revised**: 2026-10-25 — decisões do piloto com o protótipo `docs/prototipos/consola-prototipo.html` (ver Clarifications)

**Status**: Draft

**Input**: User description: "Captura detalhada de estatísticas — segunda tela de jogo ao vivo, autossuficiente, para um diretor/analista dedicado. O 'Jogo ao vivo' de hoje é pensado pro treinador (simples). Quem regista dados ao vivo neste clube é um diretor dedicado só a isso — pode ter uma tela bem mais densa, com linha por jogador (remate/cartões/falta, com zona) e um painel de equipa (fase de jogo, posse, transição com vantagem numérica, bola parada, ações defensivas, goleiro-linha). Precisa de ser autossuficiente (apito, substituição, pausa, fim de parte — mesma lógica do motor já existente). Resultado real: no pós-jogo, mostrar as transições ofensivas perdidas com vantagem numérica real."

## Clarifications

### Session 2026-10-25 (piloto com o protótipo, iPhone 16 e Samsung Galaxy Tab A11+)

- Q: Que aparelhos são alvo? → A: **Dois alvos principais**: iPhone 16 (uso atual, sobretudo na vertical) e tablet Android 10–11" (Samsung Galaxy Tab A11+). Medidas lidas no tablet (Chrome): 800×1106 CSS px na vertical, 1280×626 na horizontal. A tela não é uma consola larga reduzida para caber no telemóvel.
- Q: Como se associa jogador e ação? → A: Na **linha do jogador**: o controlo tocado define jogador e ação. **Sem seleção global** de jogador.
- Q: Densidade das linhas? → A: **Densidade B** por defeito (Golo · Remate ▸ · Falta feita · Falta recebida; o resto do remate expande na própria linha; cartões, atendimento e substituição no ⋯ do jogador). A densidade A (todas as ações visíveis) fica como opção.
- Q: Tamanho dos botões? → A: **O maior possível**: começa em 64 px e desce em degraus até ao mínimo de 48×48 CSS px, só o necessário para os 5 jogadores caberem sem scroll e nada exceder a largura.
- Q: Bloqueio da linha após substituição? → A: **Não existe.** A agilidade (menos toques) é prioritária; erros corrigem-se com Desfazer.
- Q: Zona do lance? → A: **Opcional em todas as ações dos jogadores e nos remates do adversário**; aparece logo a seguir ao lance num painel não modal; ignorá-lo não custa toques.
- Q: O que é a grelha de 12 zonas? → A: **Grelha de referência do clube, de quadra inteira, deitada e conceptual** (igual nas duas partes): nossa baliza à esquerda, a do adversário à direita (ataque →); colunas da nossa baliza para a deles **1-3 | 4-6 ‖ 7-9 | 10-12**, cada coluna de cima para baixo; meio-campo entre 4-6 e 7-9 (1-6 a nossa metade, 7-12 a do adversário). ⚠ O comentário atual de `ZONAS_GOLO` em `packages/engine/src/goalTypes.ts` ("10-12 mais perto do meio-campo") contradiz esta definição — ver Assumptions.
- Q: Transições? → A: **"Transição a favor" e "Transição contra"**, cada uma com **"Com finalização" / "Sem finalização"** e a superioridade numérica (ex. 3x1); registo em 2 toques. "Com finalização" = a transição chegou a remate (resultado `ganha`), do ponto de vista de quem ataca, também nas transições contra.
- Q: Remates do adversário? → A: **Sim, as mesmas categorias que os nossos**: golo (= golo sofrido), defendido, fora, bloqueado. Ficam na linha do nosso guarda-redes; "defendido" é atribuído ao GR em campo, "fora" e "bloqueado" não têm jogador nosso.
- Q: Fase de jogo? → A: **Removida** (custo em toques sem retorno; sobreposta às transições).
- Q: Perda e recuperação de bola? → A: **Só por zona de campo (defesa, meio-campo, ataque), sem jogador**, 1 toque cada.
- Q: Correção? → A: Além do "Desfazer" (último evento), cada categoria de equipa tem **"−"**, que anula o último evento **dessa categoria**, mesmo que não seja o último do jogo.
- Q: Contagens durante o jogo? → A: Cada botão de equipa mostra **"1ª n · total m"** (parte atual e jogo), e há um **Resumo rápido** (parte atual vs. jogo).
- Q: Onde ficam as ações de equipa? → A: **Numa barra em cima** (tablet: todas; iPhone vertical: Transição a favor, Transição contra, Golo sofrido e "Mais…").
- Q: GR-linha? → A: Mantém-se, com **estado ativo e duração sempre visíveis**; terminar regista a duração.
- Q: Convivência com o "Jogo ao vivo"? → A: A tela nova existe **em paralelo** (aba própria), sem alterar o "Jogo ao vivo"; trabalho numa branch, nunca direto em `main` (cada push para `main` publica em produção).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O diretor regista o jogo inteiro sozinho, sem nunca precisar do "Jogo ao vivo" (Priority: P1)

Um diretor dedicado a registar estatísticas entra na nova tela antes do apito, escolhe os titulares, dá o apito inicial, e acompanha o jogo até ao fim — golos, cartões, faltas, substituições, pausas, remates por jogador — sem nunca precisar de abrir a tela "Jogo ao vivo" de hoje. Cada ação já sai atribuída ao jogador certo, porque está a tocar na linha dele. Funciona no iPhone (vertical) e no tablet (vertical e horizontal).

**Why this priority**: É a base de tudo o resto. Sem autossuficiência real, a nova tela não substitui nada — fica só um complemento que ainda obriga o diretor a alternar de tela, o que era exatamente o problema a evitar. Nenhuma outra user story faz sentido entregar antes desta.

**Independent Test**: Num jogo de teste (verificação manual feita pelo utilizador — ver Assumptions), usar só a tela nova do apito ao fim do jogo — escalação, apito, pelo menos uma substituição, uma pausa, um golo, um cartão, fim de parte e fim de jogo — e confirmar que o jogo fica corretamente registado, idêntico ao que "Jogo ao vivo" produziria para as mesmas ações.

**Acceptance Scenarios**:

1. **Given** um jogo ainda não iniciado, **When** o diretor escolhe os titulares e dá o apito na tela nova, **Then** o relógio da parte começa a contar, exatamente como no "Jogo ao vivo" de hoje.
2. **Given** um jogo a decorrer na tela nova, **When** o diretor faz uma substituição (tocando no suplente e depois em "SAI" na linha de quem sai, ou a partir do ⋯ do jogador), **Then** quem entra ocupa **a mesma posição da linha** de quem saiu, o jogador que sai deixa de acumular minutos e o que entra passa a acumular, e a troca aparece no registo cronológico do jogo.
3. **Given** um jogo a decorrer, **When** o diretor inicia um pedido de tempo e depois termina-o, **Then** o tempo da pausa é descontado dos minutos de quem estava em quadra, exatamente como hoje; se o motivo for "outro" (não pedido de tempo), ninguém perde minutos.
4. **Given** uma parte a decorrer, **When** o diretor termina a parte (e, se for a última, o jogo), **Then** o estado do jogo fica igual ao que ficaria se essas ações tivessem sido feitas em "Jogo ao vivo", e a parte seguinte só começa por ação explícita.
5. **Given** o jogo todo registado só pela tela nova, **When** alguém abre o Resumo do jogo depois, **Then** golos, cartões, faltas, substituições e minutos por atleta aparecem corretos — sem nenhuma diferença por terem sido registados nesta tela em vez da antiga.
6. **Given** uma substituição ou fluxo de reposição cancelado, **When** o diretor toca depois no banco, **Then** nenhuma intenção antiga é consumida — começa um fluxo novo.

---

### User Story 2 - O diretor marca a zona de qualquer lance sem perder velocidade (Priority: P2)

Depois de marcar um lance de um jogador (remate, falta feita/recebida, cartão, defesa ou saída do guarda-redes) ou um remate do adversário, aparece logo, sem bloquear nada, a grelha de referência de 12 zonas da quadra inteira. Um toque grava a zona; ignorá-la e tocar noutra ação regista essa ação normalmente, sem toque extra.

**Why this priority**: Enriquece os dados que a User Story 1 já captura, mas não é essencial pra a tela funcionar — o diretor já consegue registar o jogo todo sem marcar zona nenhuma.

**Independent Test**: Marcar um remate, uma falta feita, uma falta recebida, um cartão, um remate do adversário defendido e uma saída do GR; para cada um, confirmar que aparece a grelha (1-3 junto à nossa baliza, à esquerda; 10-12 junto à do adversário, à direita) e que ignorá-la não impede o lance de ficar registado nem custa toques à ação seguinte.

**Acceptance Scenarios**:

1. **Given** um remate acabado de marcar, **When** o diretor toca numa zona, **Then** a zona fica associada a esse remate (2 toques no total).
2. **Given** o mesmo remate, **When** o diretor toca noutra ação qualquer (ou em ✕), **Then** o remate continua registado sem zona e a outra ação é registada normalmente.
3. **Given** uma falta recebida marcada, **When** o diretor escolhe a zona, **Then** essa zona representa tanto o local da falta como o do livre que resulta dela — não há escolha separada para o livre.
4. **Given** um golo (nosso ou sofrido), **When** o diretor abre os detalhes do golo, **Then** escolhe tipo, assistência e zona **antes** de confirmar, na mesma grelha de referência.

---

### User Story 3 - O diretor regista as ações de equipa e as do adversário em poucos toques (Priority: P3)

Numa barra em cima, o diretor regista transições a favor e contra (com/sem finalização e superioridade numérica), golos sofridos e o período de goleiro-linha; na linha do nosso guarda-redes, os remates do adversário; e, por zona de campo, perdas e recuperações de bola — tudo sem escolher jogador, exceto quando a ação é do nosso GR (defesa).

**Why this priority**: Informação tática valiosa, mas a tela já entrega valor real com só as User Stories 1 e 2. Alimenta a User Story 4.

**Independent Test**: Durante um jogo de teste, marcar uma transição a favor sem finalização em 3x1, uma transição contra com finalização, um remate do adversário fora, uma perda no meio-campo e uma recuperação no ataque, e iniciar/terminar um goleiro-linha; confirmar que todas ficam registadas com os toques indicados e aparecem nos contadores e no Resumo.

**Acceptance Scenarios**:

1. **Given** uma transição a favor, **When** o diretor toca "Transição a favor" e depois a superioridade numérica dentro de "Com finalização" ou "Sem finalização", **Then** a transição fica registada com direção, resultado e superioridade (2 toques) — não dá para a registar sem superioridade.
2. **Given** uma transição a ser marcada, **When** o diretor a regista, **Then** não há opção de atribuir a um jogador.
3. **Given** um remate do adversário, **When** o diretor toca na linha do GR "Golo sofrido" ou "Remate deles ▸" → Defendido/Fora/Bloqueado, **Then** o golo segue o fluxo de golo sofrido de hoje, "defendido" fica atribuído ao GR em campo e "fora"/"bloqueado" ficam sem jogador.
4. **Given** uma perda ou recuperação de bola, **When** o diretor toca Defesa, Meio-campo ou Ataque no bloco correspondente, **Then** fica registada com essa zona de campo e sem jogador (1 toque).
5. **Given** o guarda-redes a jogar como goleiro-linha, **When** o diretor marca o início, **Then** o estado ativo e a duração ficam sempre visíveis; ao terminar, fica registado um período com duração — sem alterar quem está listado em quadra.

---

### User Story 4 - O treinador vê, depois do jogo, as transições ofensivas desperdiçadas com vantagem numérica (Priority: P4)

Depois do jogo, o treinador consegue ver uma lista das transições a favor que a equipa teve com vantagem numérica real (ex. 3x1, 2x1) mas que terminaram **sem finalização** — o alerta de coaching que motivou registar a vantagem numérica de cada transição.

**Why this priority**: Fecha o ciclo "captura → informação útil", mas pode vir depois das primeiras três sem perder valor imediato.

**Independent Test**: Com um jogo de teste que tenha pelo menos uma transição a favor sem finalização com vantagem numérica real e uma com igualdade/desvantagem, confirmar que só a primeira aparece na lista.

**Acceptance Scenarios**:

1. **Given** um jogo com transições a favor marcadas, **When** o treinador consulta a lista de transições desperdiçadas, **Then** só aparecem as "sem finalização" com vantagem numérica real.
2. **Given** uma transição a favor "com finalização" com vantagem numérica, **When** o treinador consulta essa lista, **Then** essa transição não aparece.

---

### User Story 5 - O diretor vê e corrige as contagens durante o jogo (Priority: P3)

Durante o jogo, o diretor vê nos próprios botões de equipa quantas ações houve na parte atual e no jogo, consulta um Resumo rápido, e corrige um registo de uma categoria de equipa feito há pouco sem desfazer tudo o que veio depois.

**Why this priority**: Torna os dados de equipa fiáveis e úteis ao intervalo, com o mesmo princípio de agilidade.

**Independent Test**: Registar duas transições a favor, uma falta e depois tocar "−" na transição a favor; confirmar que só a última transição a favor deixa de contar, que a falta se mantém e que "Desfazer" repõe a anulação.

**Acceptance Scenarios**:

1. **Given** eventos de várias categorias, **When** o diretor toca "−" numa categoria de equipa, **Then** só o último evento dessa categoria é anulado, com aviso visível do que foi anulado; "Desfazer" repõe-no.
2. **Given** uma categoria sem eventos, **When** o diretor olha para o "−", **Then** está desativado.
3. **Given** a 2ª parte a decorrer, **When** o diretor olha para um botão de equipa, **Then** vê "2ª n · total m".
4. **Given** o Resumo rápido aberto, **When** o diretor consulta, **Then** vê, para a parte atual e para o jogo: transições a favor/contra (com/sem finalização; sem finalização em superioridade), remates nossos e deles por resultado, faltas, perdas e recuperações por zona, cartões.

---

### Edge Cases

- O estado de "goleiro-linha ativo" é só informativo — não força nenhuma substituição nem muda quem está listado em quadra.
- Um cartão vermelho continua a retirar o jogador de quadra; a linha fica como **vaga** na mesma posição, e a reposição exige escolha **e confirmação** explícitas (a elegibilidade de reposição não é validada pela tela).
- Se o GR for expulso (linha vaga), "Golo sofrido" continua disponível na barra de equipa.
- Se o diretor esquecer de terminar uma pausa antes de terminar a parte, a pausa fecha-se sozinha ao terminar a parte (como hoje).
- A equipa adversária atinge a 5ª falta acumulada da parte — mesmo aviso que já existe hoje; a 6ª falta é o limiar real da sanção.
- Fim de parte e início de parte não são desfeitos pelo "Desfazer" da tela; o "Desfazer" não atravessa um limite de parte.
- Desfazer nunca faz recuar o relógio da parte.
- No iPhone vertical, a grelha de zonas pode tapar temporariamente as linhas de baixo; tocar numa linha tapada exige fechar a grelha primeiro (✕).

## Requirements *(mandatory)*

### Functional Requirements

**Autossuficiência (User Story 1)**

- **FR-001**: A nova tela DEVE permitir escolher os titulares e dar o apito inicial de cada parte, com o mesmo efeito que a tela "Jogo ao vivo" já produz hoje.
- **FR-002**: A nova tela DEVE permitir substituições, com o jogador que sai a parar de acumular minutos e o que entra a começar, exatamente como hoje; quem entra ocupa a posição da linha de quem sai; cancelar um fluxo de substituição nunca deixa uma intenção pendente.
- **FR-003**: A nova tela DEVE permitir iniciar e terminar uma pausa (pedido de tempo ou outro motivo), com o mesmo efeito sobre os minutos de quem está em quadra que já existe hoje (só pedido de tempo desconta; outro motivo não).
- **FR-004**: A nova tela DEVE permitir terminar a parte e, quando for a última, terminar o jogo; a parte seguinte só começa por ação explícita.
- **FR-005**: O diretor NUNCA DEVE precisar de abrir a tela "Jogo ao vivo" durante um jogo registado pela tela nova.
- **FR-006**: A nova tela DEVE continuar a permitir marcar golo, cartão amarelo/vermelho, falta cometida/sofrida e atendimento, com o mesmo resultado que a tela "Jogo ao vivo" já produz.

**Captura por jogador e zona (User Story 2)**

- **FR-007**: Cada jogador em quadra DEVE ter a sua própria linha de ações, de forma que qualquer lance marcado nessa linha fique automaticamente atribuído a esse jogador, sem seleção global nem passo extra de "escolher quem".
- **FR-008**: Um jogador de linha DEVE poder marcar um remate com um dos 4 resultados: golo, defendido, fora, ou bloqueado.
- **FR-009** *(revisto)*: A linha do guarda-redes NÃO DEVE ter remate próprio; em vez disso DEVE ter os **remates do adversário** (golo sofrido, defendido, fora, bloqueado — ver FR-024) e, no ⋯, as situações de 1x1 (saída ganha/perdida).
- **FR-010** *(revisto)*: Depois de marcar qualquer ação de jogador (remate, falta feita/recebida, cartão, defesa, saída) ou um remate do adversário, o diretor DEVE ter a opção (nunca obrigatória) de indicar a zona, na **grelha de referência de quadra inteira** definida nas Clarifications; o golo (nosso ou sofrido) recolhe a zona nos seus detalhes, antes de confirmar.
- **FR-011**: Saltar a escolha de zona NUNCA DEVE impedir, atrasar ou custar toques ao registo do lance principal nem da ação seguinte.

**Painel de equipa (User Stories 3 e 5)**

- **FR-012** *(revisto)*: A tela DEVE ter uma área própria, no topo, para eventos de equipa — tablet: todas as ações de equipa; iPhone vertical: Transição a favor, Transição contra, Golo sofrido e "Mais…" (com o resto).
- **FR-013** *(removido em 2026-10-25)*: ~~Fase de jogo ativa da equipa.~~ Não faz parte desta entrega.
- **FR-014** *(revisto)*: O diretor DEVE poder marcar uma transição **a favor ou contra**, com resultado **com/sem finalização** e a superioridade numérica (presets de `goalTypes.ts`) — os três obrigatórios — em 2 toques a partir da área de equipa.
- **FR-015**: Uma transição NUNCA DEVE oferecer a opção de atribuir a um jogador específico.
- **FR-016** *(revisto)*: O diretor DEVE poder marcar **perda e recuperação de bola por zona de campo (defesa, meio-campo, ataque), sem jogador**, com 1 toque. Bola parada ganha e ações defensivas genéricas **não fazem parte desta entrega**.
- **FR-017** *(revisto)*: O diretor DEVE poder marcar o início e o fim de uma situação de goleiro-linha como um período com duração; enquanto ativo, o estado e a duração DEVEM estar sempre visíveis.
- **FR-018** *(adiado)*: Dedução automática do tipo de origem de um remate/golo — fora desta entrega (dependia de fase de jogo e de recuperações por jogador, entretanto retiradas).

**Relatório de transições desperdiçadas (User Story 4)**

- **FR-019**: O sistema DEVE permitir consultar, depois do jogo, a lista de transições **a favor sem finalização** cuja superioridade numérica representa uma vantagem real (não igualdade nem desvantagem).
- **FR-020**: Transições com finalização, ou com igualdade/desvantagem numérica, NUNCA DEVEM aparecer nessa lista.
- **FR-021** *(revisto)*: Todos os novos tipos de lance capturados por esta tela (remate, remate do adversário, transição, perda, recuperação, defesa, saída, goleiro-linha, anulação) DEVEM aparecer no Resumo do jogo, na Timeline exportável e na tela de corrigir registo, da mesma forma que os tipos já existentes.

**Interação, correção e contagens (novos em 2026-10-25)**

- **FR-022**: A tela DEVE funcionar no iPhone (vertical, alvo principal; horizontal, secundário) e no tablet (vertical e horizontal), sem scroll horizontal na operação principal, sem texto essencial truncado, sem desativar o zoom, sem depender de hover, respeitando as safe areas, e sem deslocar a lista ao registar eventos ou atualizar o relógio.
- **FR-023**: Os alvos de toque DEVEM ter no mínimo 48×48 CSS px e DEVEM ser os maiores possíveis (até 64 px) sem esconder jogadores em quadra.
- **FR-024**: O diretor DEVE poder marcar os remates do adversário com as mesmas categorias dos nossos: golo (= golo sofrido), defendido (atribuído ao GR em campo), fora e bloqueado (sem jogador nosso).
- **FR-025**: Cada categoria de equipa (transição a favor/contra, golo sofrido, remates do adversário, perdas e recuperações por zona) DEVE ter um "−" que anula o **último evento dessa categoria**, mesmo que não seja o último do jogo; a anulação DEVE ser visível e desfazível. A anulação NUNCA DEVE apagar um evento já gravado/sincronizado — DEVE ser um evento explícito de anulação/correção (Princípio I; guarda `match_events_update_guard`, migração 0026).
- **FR-026**: Cada botão de equipa DEVE mostrar a contagem da parte atual e do jogo ("1ª n · total m").
- **FR-027**: A tela DEVE oferecer um Resumo rápido (parte atual vs. jogo), acessível em 1 toque.
- **FR-028**: Acrescentar a zona depois de o lance estar registado NUNCA DEVE alterar um evento já enviado ao servidor sem a marca de correção exigida pela guarda de UPDATE (migração 0026); a forma de o garantir (ex.: reter o envio do evento até a zona ser escolhida ou o painel fechar, ou registar a zona como correção explícita) é decisão do plano.
- **FR-029**: A tela nova DEVE coexistir com o "Jogo ao vivo" (aba própria), sem alterar o seu comportamento.

**Fora de escopo nesta entrega**

- Fase de jogo; bola parada ganha; ações defensivas genéricas; perda/recuperação atribuída a jogador; dedução automática do tipo de origem (FR-018).
- Bloqueio temporário da linha após substituição.
- Novos avisos visuais para a falta acumulada (o aviso atual a partir da 5ª mantém-se).
- Campo de "vantagem numérica" fora do contexto de transição.
- Validação automática da elegibilidade de reposição após cartão vermelho.

### Key Entities

- **Remate**: lance de um jogador de linha que termina em golo, defendido, fora ou bloqueado — com zona opcional.
- **Remate do adversário**: golo sofrido, defendido (atribuído ao nosso GR), fora ou bloqueado (sem jogador nosso) — com zona opcional.
- **Transição**: lance de equipa com direção (a favor/contra), resultado (com/sem finalização) e superioridade numérica — nunca atribuído a um jogador.
- **Perda / Recuperação de bola**: evento de equipa com zona de campo (defesa, meio-campo, ataque), sem jogador.
- **Goleiro-linha**: período (início/fim, com duração) em que o guarda-redes joga como jogador de linha.
- **Anulação**: registo explícito que anula um evento anterior de uma categoria de equipa (nunca apaga o evento original).
- **Zona**: posição 1-12 na grelha de referência de quadra inteira (ver Clarifications).
- **Transição desperdiçada**: transição a favor sem finalização com vantagem numérica real — conceito derivado (User Story 4), não um dado guardado à parte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um diretor consegue registar um jogo inteiro (apito ao fim) usando só a tela nova, sem nunca precisar de abrir a tela "Jogo ao vivo", no iPhone e no tablet.
- **SC-002**: Depois de um jogo registado só pela tela nova, o Resumo do jogo mostra golos, cartões, faltas, substituições e minutos por atleta corretos, sem nenhuma diferença do que mostraria se tivesse sido registado pela tela antiga.
- **SC-003** *(revisto)*: Partindo do ecrã principal sem nada aberto: falta feita/recebida = 1 toque; remate sem golo = 2 toques (densidade B); zona = +1 toque opcional; transição = 2 toques; perda/recuperação por zona = 1 toque; golo sem detalhes = 2 toques (golo + confirmar).
- **SC-004**: Um treinador consegue identificar, depois do jogo, quantas transições a favor com vantagem numérica real terminaram sem finalização, sem rever o jogo manualmente.
- **SC-005**: Nas medidas de referência (iPhone 16 vertical; Galaxy Tab A11+ 800×1106 e 1280×626), os 5 jogadores em quadra ficam visíveis sem scroll na densidade B, com alvos ≥ 48 CSS px — confirmado no aparelho real, não só por emulação.

## Assumptions

- O diretor é o único a escrever no jogo ao vivo em qualquer momento (mesma trava de jogo que o "Jogo ao vivo").
- **Grelha de zonas**: esta spec usa a definição do clube (Clarifications). O comentário atual de `ZONAS_GOLO` (`goalTypes.ts`) descreve 10-12 como "mais perto do meio-campo"; antes de implementar, o plano DEVE confirmar como a grelha é apresentada hoje na folha de golo do "Jogo ao vivo" e se as zonas de golos já registados têm o mesmo significado, corrigindo o comentário.
- Dispositivos: iPhone 16 e Samsung Galaxy Tab A11+ (ver Clarifications). A tela adapta-se ao viewport efetivo, não à resolução física.
- O acesso à tela nova reaproveita a mesma permissão de hoje para "Jogo ao vivo" (`team_admin`/`data_entry`).
- Os novos tipos de lance precisam de aparecer no Resumo do jogo, na Timeline exportável e na tela de corrigir registo já nesta entrega.
- Verificação: testes automatizados nunca tocam rede nem um Supabase real (Princípio IV); a verificação num jogo de teste real é manual e feita pelo utilizador, nunca por automação de agentes (`CLAUDE.md`).
- Publicação: desenvolvimento numa branch de trabalho; merge para `main` (= produção) só com autorização explícita e depois dos Portões de Qualidade da constituição.
- Referência de interação: `docs/prototipos/consola-prototipo.html` (protótipo com dados fictícios; não é especificação de código).
