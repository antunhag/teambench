# Feature Specification: Acesso Multiusuário Robusto

**Feature Branch**: `001-multi-user-access`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Robustecer o acesso multiusuário do clube atual (Académica de Leça, Sub-15) para suportar vários treinadores/assistentes reais usando o Teambench ao mesmo tempo, com confiança. Já existe: papéis (team_admin/data_entry/viewer) com RLS no servidor, convite por email (token), trava de edição ao vivo por conta (não por aparelho, não funciona offline). Já aconteceu edição concorrente real sem aviso. Não é sobre multi-tenant nem comercial — é sobre múltiplas pessoas reais gerindo a MESMA equipa sem se atropelarem."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ninguém mais edita o mesmo jogo ao mesmo tempo, nunca (Priority: P1)

Hoje a trava de edição (migração 0009) só cobre o jogo **AO VIVO**. O corretor pós-jogo ("Corrigir registo") não tem trava nenhuma — dois Admins podem abrir o mesmo jogo já terminado ao mesmo tempo e um pode sobrescrever a correção do outro sem saber. A solução é estender a trava já existente (não inventar um mecanismo novo): o mesmo `live_holder_id`/heartbeat que já impede duas contas de registar o mesmo jogo ao vivo passa a cobrir também o período em que alguém está no corretor pós-jogo.

**Why this priority**: Dados de jogo são o Princípio I da constituição (correção acima de tudo) — e já existe a infraestrutura pronta (migração 0009), só falta estender o alcance dela.

**Independent Test**: Um Admin abre "Corrigir registo" de um jogo terminado; um segundo Admin tenta abrir o mesmo jogo; o segundo vê que o jogo está a ser corrigido por outra pessoa e não consegue entrar, em vez de entrar e editar em paralelo sem saber.

**Acceptance Scenarios**:

1. **Given** um Admin está em "Corrigir registo" de um jogo, **When** um segundo Admin tenta abrir o mesmo jogo (ao vivo ou pós-jogo), **Then** o segundo vê que o jogo está a ser editado por outra pessoa e é impedido de entrar, com uma mensagem clara.
2. **Given** o primeiro Admin fecha o corretor ou perde a sessão, **When** o segundo tenta entrar de novo, **Then** consegue, sem precisar de intervenção manual.
3. **Given** um Admin reabre o MESMO jogo que ele próprio já estava a corrigir (ex.: noutro separador, ou o telemóvel morreu a meio), **When** tenta entrar, **Then** consegue sem bloqueio — a trava é por conta, nunca por aparelho/aba, igual à trava do jogo ao vivo já existente.

---

### User Story 2 - Ninguém mais edita a mesma tela ao mesmo tempo, nunca (Priority: P1)

Mesmo mecanismo da User Story 1 (reaproveitar a trava, não inventar outra coisa), agora aplicado a Plantel, Formato de Jogo e Convites: hoje é possível duas contas editarem a mesma tela de gestão ao mesmo tempo e uma gravação apagar a outra silenciosamente, sem aviso nenhum. A trava passa a cobrir a tela inteira enquanto alguém a está a editar — simples de implementar e simples de entender, sem precisar de deteção fina por registo individual.

**Why this priority**: É o problema já observado na prática nesta mesma equipa (não hipotético), fora do âmbito do jogo que a User Story 1 resolve.

**Independent Test**: Um utilizador abre a edição em Plantel; um segundo utilizador tenta editar qualquer coisa na mesma tela; o segundo vê que a tela está a ser editada por outra pessoa e é impedido de entrar, em vez de editar em paralelo e arriscar apagar a alteração do primeiro.

**Acceptance Scenarios**:

1. **Given** um utilizador está a editar em Plantel (ou Formato de Jogo, ou Convites), **When** um segundo utilizador tenta editar algo na MESMA tela, **Then** o segundo vê que a tela está a ser editada por outra pessoa e é impedido de entrar, com uma mensagem clara.
2. **Given** o primeiro utilizador termina ou fecha a edição, **When** o segundo tenta entrar de novo, **Then** consegue, sem precisar de intervenção manual.
3. **Given** um utilizador está sozinho a editar uma tela (sem ninguém mais nela), **When** grava uma alteração, **Then** não vê nenhum aviso ou passo extra — o fluxo continua tão simples quanto hoje.

---

### User Story 3 - Admin consegue ver quem tem acesso e com que papel, com confiança (Priority: P2)

O Admin da Equipa já vê a lista de membros e convites pendentes (tela "Acesso à equipa"), mas não tem nenhum sinal de quando cada acesso foi concedido nem de remoções recentes — precisa confiar de cor em quem fez o quê.

**Why this priority**: Gerir acesso com confiança é o cerne do pedido ("mais robusto e sério"), mas depende menos de infraestrutura nova do que as User Stories 1 e 2, por isso vem depois.

**Independent Test**: O Admin da Equipa abre "Acesso à equipa" e consegue responder, só olhando a tela, "quando é que esta pessoa ganhou acesso, e quem a removeu" sem precisar perguntar a ninguém.

**Acceptance Scenarios**:

1. **Given** um membro foi adicionado à equipa (convite aceite), **When** o Admin da Equipa abre "Acesso à equipa", **Then** vê a data em que o acesso foi concedido.
2. **Given** um Admin remove o acesso de alguém, **When** outro Admin da equipa olha o histórico, **Then** consegue ver que essa remoção aconteceu, quando, e por quem.
3. **Given** só existe UM Admin da Equipa, **When** esse Admin tenta remover o acesso de outro membro ou despromovê-lo (não há ninguém mais pra promover a Admin), **Then** o sistema não bloqueia — a proteção é só sobre nunca ficar sem Admin, não sobre o tamanho da equipa.
4. **Given** só existe UM Admin da Equipa (ele próprio), **When** esse Admin tenta remover o PRÓPRIO acesso ou despromover-se a si mesmo, **Then** o sistema impede, com uma mensagem clara ("és o único Admin — promove outra pessoa primeiro").
5. **Given** existem DOIS ou mais Admins da Equipa, **When** um deles remove o acesso de outro Admin (incluindo remover-se a si próprio), **Then** o sistema permite normalmente — a proteção só entra quando restaria zero Admins.

---

### User Story 4 - Mensagens de "tela ocupada" compreensíveis para quem não é técnico (Priority: P3)

Quando as User Stories 1 e 2 impedem alguém de entrar numa tela (jogo ou Plantel/Formato/Convites já em edição por outra pessoa), a mensagem mostrada ao treinador precisa ser compreensível sem jargão técnico, consistente com o Princípio V da constituição.

**Why this priority**: É um requisito transversal às outras, não uma funcionalidade isolada — por isso vem por último como validação, não como entrega própria.

**Independent Test**: Mostrar as mensagens de bloqueio das User Stories 1 e 2 a alguém sem background técnico e confirmar que a pessoa entende o que aconteceu e o que fazer a seguir, sem explicação adicional.

**Acceptance Scenarios**:

1. **Given** um bloqueio acontece (jogo ou tela de gestão já em edição por outra pessoa), **When** a mensagem é mostrada, **Then** ela explica em português simples o que aconteceu (quem/o quê está a ocupar) e o que fazer a seguir, nunca um código de erro técnico isolado.

### Edge Cases

- Um Admin que está a corrigir um jogo fecha o browser sem avisar (crash, bateria) — quanto tempo até a trava libertar pra outra pessoa poder entrar? (mesma pergunta já resolvida pra trava do jogo ao vivo via heartbeat, migração 0009 — reaproveitar o mesmo intervalo.)
- Um utilizador que está a editar Plantel/Formato/Convites fecha o browser sem avisar (crash, bateria) — mesma pergunta e mesma resposta do item acima (heartbeat liberta a trava).
- Dois utilizadores tentam editar a mesma tela enquanto AMBOS estão offline — nenhum dos dois consegue saber do outro até a rede voltar; a trava depende de rede, igual ao resto do sistema de sincronização.
- Um Admin da Equipa tenta remover o PRÓPRIO acesso sendo o último Admin da equipa — ver FR-011 (cenário coberto explicitamente na User Story 3).
- O histórico de acesso (User Story 3) cresce ao longo de várias épocas — dado o volume real (um clube pequeno, poucos membros), nenhum limite/paginação é necessário por agora.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE estender a trava de edição já existente (`matches.live_holder_id`/heartbeat, migração 0009) para também cobrir o corretor pós-jogo ("Corrigir registo"), não só o jogo ao vivo — um jogo (ao vivo ou já terminado) só pode estar a ser editado por UMA conta de cada vez.
- **FR-002**: A trava (FR-001) DEVE continuar a ser por CONTA, nunca por aparelho/aba — o mesmo utilizador pode reabrir o mesmo jogo noutro aparelho sem se bloquear a si próprio, igual ao comportamento já existente pro jogo ao vivo.
- **FR-003**: O sistema DEVE estender o mesmo mecanismo de trava (FR-001) para também cobrir as telas de Plantel, Formato de Jogo e Convites — só uma conta de cada vez pode estar a editar cada uma dessas telas.
- **FR-004**: Quando a trava (FR-003) impede um segundo utilizador de entrar numa tela já em edição, ele DEVE ver uma mensagem clara, sem conseguir editar nem gravar nada até a tela ficar livre — nunca uma opção de "editar mesmo assim".
- **FR-005**: A trava (FR-003) é por TELA inteira, não por registo individual — editar um atleta diferente não é tratado como um caso especial; a tela inteira fica indisponível pra outra conta enquanto alguém a estiver a editar, igual ao padrão de UX da User Story 1.
- **FR-006**: Um utilizador sozinho a editar uma tela (sem mais ninguém nela) NÃO DEVE ver nenhum aviso ou passo extra — a trava é invisível quando não há disputa.
- **FR-007**: O sistema DEVE manter um registo de quando cada membro atual ganhou acesso à equipa (data de entrada).
- **FR-008**: O sistema DEVE manter um registo de remoções de acesso — quem foi removido, quando, e por qual Admin.
- **FR-009**: O histórico de acesso (FR-007, FR-008) DEVE ser visível só para quem já é Admin da Equipa — nunca para Lançador de dados ou Visualizador, mesma separação de papéis já aplicada ao resto do sistema.
- **FR-010**: O sistema DEVE impedir que OUTRO Admin remova o acesso ou despromova o ÚLTIMO Admin restante de uma equipa — nunca pode ficar uma equipa sem nenhum Admin.
- **FR-011**: O sistema DEVE impedir que um Admin remova o PRÓPRIO acesso ou se despromova a si mesmo quando ele é o ÚLTIMO Admin da equipa — mesma regra do FR-010, aplicada explicitamente à auto-remoção, que é um caminho de UI distinto (sair da equipa vs. remover outro membro).
- **FR-012**: Quando há DOIS OU MAIS Admins na equipa, a proteção (FR-010/FR-011) NÃO se aplica — qualquer Admin pode remover ou despromover qualquer outro Admin, incluindo a si próprio, normalmente.

### Key Entities

- **Posse de edição**: generalização da trava já existente (`matches.live_holder_id`/heartbeat) — a mesma ideia (uma conta, um recurso, até libertar) passa a cobrir quatro recursos: jogo ao vivo (já existia), corretor pós-jogo, Plantel, Formato de Jogo, e Convites. Cada recurso tem a sua própria posse independente — editar Plantel não bloqueia Formato de Jogo.
- **Registo de acesso**: entrada de quando um membro entrou na equipa ou foi removido, e por quem — histórico, não editável depois de criado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhum jogo (ao vivo ou em correção pós-jogo) é editado por duas contas ao mesmo tempo — a segunda conta é sempre impedida de entrar, nunca entra em paralelo sem saber.
- **SC-002**: Nenhuma alteração de um utilizador em Plantel/Formato/Convites desaparece silenciosamente por ter sido sobrescrita por outro utilizador editando a mesma tela ao mesmo tempo — a segunda conta é sempre impedida de entrar, nunca entra em paralelo sem saber.
- **SC-003**: Um Admin da Equipa consegue responder "quando é que esta pessoa ganhou acesso" e "quem removeu aquele acesso" olhando só a tela de Acesso à Equipa, sem precisar perguntar a ninguém.
- **SC-004**: Um treinador sem conhecimento técnico, ao ver uma mensagem de tela ocupada, entende o que aconteceu e sabe o que fazer a seguir sem pedir ajuda.
- **SC-005**: Um utilizador editando sozinho (sem mais ninguém na mesma tela) não percebe nenhuma mudança no fluxo de hoje — zero passos extra, zero lentidão perceptível.
- **SC-006**: Nunca é possível uma equipa ficar sem nenhum Admin da Equipa.

## Assumptions

- O volume real de utilizadores simultâneos é pequeno (poucos treinadores/assistentes por equipa) — nenhuma solução de alta escala (ex.: locking distribuído sofisticado) é necessária, algo simples já resolve.
- "Robusto" aqui significa confiança e ausência de perda de dados silenciosa — não inclui, por agora, suporte offline mais sofisticado para Plantel/Formato/Convites (o registo de jogo já é o único fluxo com garantia offline forte, por desenho, e continua sendo).
- Não há requisito legal/formal de auditoria (compliance) por trás do registo de acesso (FR-007/FR-008) — é só para dar confiança operacional ao Admin da Equipa, não para cumprir alguma norma externa.
- A trava única "uma conta, um recurso, até libertar" (FR-001/FR-003) reaproveita a infraestrutura já existente (migração 0009), generalizada pra cobrir quatro recursos (jogo ao vivo, corretor pós-jogo, Plantel, Formato de Jogo, Convites) — não é um mecanismo novo do zero, nem quatro mecanismos diferentes.
