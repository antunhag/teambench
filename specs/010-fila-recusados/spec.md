# Feature Specification: Lances recusados não bloqueiam a sincronização

**Feature Branch**: `claude/fervent-fermi-q3zk57` (trabalho; nunca direto em `main`)

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Fila de sincronização resiliente a itens recusados. Hoje todos os lances pendentes da conta são enviados de uma vez; se o servidor recusar UM (alterado na Registo, conta sem permissão nessa equipa, jogo apagado), nada mais sincroniza — de nenhum jogo — e a app só mostra 'N por sincronizar' para sempre, sem explicar. Quando o envio é recusado, tentar lance a lance; os aceites saem da fila; os recusados ficam guardados (nunca descartados) e deixam de bloquear os outros; a app diz numa frase simples quantos lances foram recusados e porquê. Distinguir recusa geral (sessão expirada, sem rede) — nada é posto de lado, tenta-se depois — de recusa de um lance. Fora de escopo: descartar/exportar recusados, mudanças de permissões ou migrações." (origem: auditoria técnica de 2026-11-07, achados A-4/S-L3)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um lance recusado não impede os outros de chegar ao servidor (Priority: P1)

O diretor regista um jogo no tablet. Um dos lances que estão por enviar já não é aceite pelo
servidor (por exemplo, foi corrigido entretanto na Registo noutro aparelho). Todos os outros
lances — deste jogo e de outros — continuam a chegar ao servidor normalmente; só esse fica
para trás.

**Why this priority**: Hoje um único lance recusado pára a sincronização de tudo, em silêncio.
Num jogo ao vivo isso significa que o Resumo e a Timeline nos outros aparelhos deixam de
atualizar sem ninguém saber porquê, e os dados ficam só num tablet que pode perder-se. É o
risco de dados (Princípio I) que motiva esta entrega.

**Independent Test**: Com um aparelho que tenha na fila vários lances válidos e um que o
servidor recuse, confirmar que, depois de voltar a rede, os válidos aparecem no servidor e só
o recusado continua guardado no aparelho.

**Acceptance Scenarios**:

1. **Given** 20 lances por enviar, um deles recusado pelo servidor, **When** a app tenta
   sincronizar, **Then** os 19 aceites chegam ao servidor e saem da fila, e o recusado fica
   guardado no aparelho.
2. **Given** lances por enviar de dois jogos, um lance recusado no jogo A, **When** a app
   sincroniza, **Then** os lances do jogo B chegam todos ao servidor.
3. **Given** um lance já posto de lado como recusado, **When** o diretor regista lances novos,
   **Then** os novos sincronizam normalmente, sem esperar pelo recusado.
4. **Given** um lance recusado, **When** a app tenta outra vez mais tarde e o servidor já o
   aceita (ex.: a permissão foi reposta), **Then** o lance chega ao servidor e deixa de estar
   recusado.

---

### User Story 2 - O treinador percebe o que aconteceu, em português simples (Priority: P1)

Quando há lances recusados, a app diz quantos são e porquê, numa frase que um treinador
entende, em vez de mostrar para sempre "N por sincronizar".

**Why this priority**: Sem isto, a falha continua invisível (Princípio V) e ninguém sabe que
tem de agir.

**Independent Test**: Provocar um lance recusado e confirmar que a mensagem aparece no ecrã do
jogo e no ecrã principal, com o número de lances e um motivo compreensível.

**Acceptance Scenarios**:

1. **Given** 2 lances recusados porque a conta já não tem permissão nessa equipa, **When** o
   treinador olha para o estado de sincronização, **Then** vê algo como "2 lances não foram
   aceites pelo servidor: a tua conta já não tem permissão nesta equipa. Ficam guardados
   neste aparelho."
2. **Given** lances recusados e lances ainda por enviar, **When** o treinador olha para o
   estado, **Then** os dois números aparecem separados (por enviar vs. recusados).
3. **Given** lances recusados, **When** o treinador toca em "Tentar outra vez", **Then** a app
   volta a tentar enviá-los nesse momento.

---

### User Story 3 - Sessão expirada ou sem rede não põe nada de lado (Priority: P1)

Se o problema é geral (sem rede, sessão expirada, servidor indisponível), a app não trata os
lances como recusados: ficam por enviar e são enviados quando o problema passar, como hoje.

**Why this priority**: Pôr de lado lances válidos por causa de um problema passageiro seria
pior do que o problema atual — deixariam de ser enviados automaticamente.

**Independent Test**: Com a sessão expirada (ou o servidor indisponível), confirmar que nenhum
lance passa a "recusado" e que todos são enviados quando a sessão é renovada.

**Acceptance Scenarios**:

1. **Given** lances por enviar e a sessão expirada, **When** a app tenta sincronizar, **Then**
   nenhum lance fica marcado como recusado e a mensagem continua a ser "por sincronizar".
2. **Given** lances por enviar e o servidor a falhar para todos por um motivo geral, **When**
   a app tenta sincronizar, **Then** nenhum lance é posto de lado.

---

### Edge Cases

- **Recusa geral disfarçada**: todos os lances são recusados um a um pelo mesmo motivo de
  sessão/rede → é tratado como recusa geral (nada posto de lado).
- **Todos recusados por motivo do próprio lance** (ex.: três lances de um jogo apagado) → são
  postos de lado; nada mais fica bloqueado.
- **Envio interrompido a meio** (rede cai durante o envio lance a lance) → os já aceites saem
  da fila, os restantes continuam por enviar (não recusados).
- **Reenvio de um lance que o servidor já tem igual** → continua a contar como aceite (como hoje).
- **Fila ilegível ou quarentena** → comportamento atual mantém-se (nunca é sobrescrita nem
  enviada automaticamente).
- **Troca de conta no mesmo aparelho** → os recusados pertencem à conta que os registou e só
  aparecem a essa conta, como a fila de hoje.
- **Reabrir o jogo** → um lance recusado continua no registo local desse aparelho; ler o
  servidor nunca o faz desaparecer.
- **Muitos lances por enviar de uma vez** → o envio lance a lance só acontece quando o envio
  conjunto é recusado; no caso normal continua a ser um único envio.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Quando o envio conjunto dos lances pendentes for recusado, a app DEVE tentar
  enviar cada lance separadamente, para isolar os que o servidor não aceita.
- **FR-002**: Cada lance aceite DEVE sair da fila assim que o servidor o aceita, mesmo que
  outros lances do mesmo envio sejam recusados.
- **FR-003**: Um lance recusado por um motivo do próprio lance DEVE ser posto de lado e NÃO
  DEVE voltar a bloquear o envio dos restantes.
- **FR-004**: Um lance recusado NUNCA DEVE ser apagado nem alterado pela app; fica guardado no
  aparelho, associado à conta que o registou, exatamente como foi registado.
- **FR-005**: Recusas gerais (sem rede, sessão expirada, servidor indisponível, ou todos os
  lances recusados pelo mesmo motivo de sessão) NÃO DEVEM pôr nenhum lance de lado; os lances
  continuam por enviar e são tentados como hoje.
- **FR-006**: Os lances recusados DEVEM voltar a ser tentados automaticamente, com menos
  frequência do que os pendentes (ao abrir a app e periodicamente), e também quando o
  utilizador tocar em "Tentar outra vez".
- **FR-007**: A app DEVE mostrar, separado de "por sincronizar", o número de lances recusados
  e o motivo em português simples, no ecrã principal e nos ecrãs de jogo (Jogo ao vivo e
  Consola).
- **FR-008**: Os motivos mostrados DEVEM incluir pelo menos: lance alterado entretanto na
  Registo; conta sem permissão nessa equipa; jogo ou atleta que já não existe; e um motivo
  genérico para o resto (com o detalhe técnico entre parênteses, para poder ser reportado).
- **FR-009**: Um lance recusado DEVE continuar a contar no estado local do jogo nesse aparelho;
  ler o servidor (ex.: ao reabrir o jogo) NUNCA DEVE fazê-lo desaparecer.
- **FR-010**: O caso normal (nenhuma recusa) DEVE continuar a ser um único envio, sem custo
  extra.
- **FR-011**: Esta entrega NÃO DEVE alterar permissões, regras do servidor nem o modelo de
  dados do servidor.

### Key Entities

- **Lance pendente**: lance registado no aparelho, ainda não aceite pelo servidor (já existe).
- **Lance recusado**: lance que o servidor recusou por um motivo do próprio lance; guardado no
  aparelho por conta, com o motivo e a data da última tentativa; volta a pendente-aceite quando
  o servidor o aceitar.
- **Motivo de recusa**: categoria simples (alterado na Registo, sem permissão, já não existe,
  outro) derivada da resposta do servidor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com um lance recusado entre N pendentes, os outros N−1 chegam ao servidor na
  primeira tentativa de sincronização com rede.
- **SC-002**: Em nenhuma situação um lance registado é perdido: cada lance está sempre no
  servidor, por enviar ou recusado no aparelho.
- **SC-003**: Com a sessão expirada ou sem rede, 0 lances passam a "recusados".
- **SC-004**: Um treinador sem formação técnica, ao ver a mensagem de recusa, consegue dizer
  quantos lances ficaram por aceitar e porquê, sem ajuda.

## Assumptions

- O servidor indica na resposta o tipo de recusa (permissão, regra de correção, referência
  inexistente, sessão); a app classifica a partir disso, com "outro" como recurso.
- Descartar ou exportar lances recusados fica para uma entrega futura e exigirá confirmação
  explícita (Princípio I).
- A fila continua por conta e por aparelho, como hoje; a quarentena de fila ilegível mantém o
  seu comportamento.
- Testes automáticos sem rede e sem Supabase real (Princípio IV), com um servidor simulado; a
  verificação no aparelho é feita pelo utilizador.
- Trabalho na branch `claude/fervent-fermi-q3zk57`; publicação em `main` por decisão do
  utilizador, depois dos Portões de Qualidade.
