# Research: Geração automática de plano de rotação completo

## Decisão 1: Peso guardado numa tabela relacional nova, por jogo/atleta/vaga

**Decisão**: `rotation_plan_weights(match_id, player_id, slot_type, weight)`, uma
linha por combinação — mesmo padrão relacional já usado em `rotation_plan_stints`
(migração 0012), nunca um JSON embutido em `matches` ou `rotation_plans`.

**Rationale**: Consistência com o resto do esquema (nenhuma tabela usa JSON pra dados
estruturados e consultáveis); `unique (match_id, player_id, slot_type)` garante um
único peso vigente por combinação, sem lógica de merge; RLS por `team_id`
denormalizado, mesmo padrão já auditado em `rotation_plan_stints`.

**Alternatives considered**: Guardar pesos dentro de `rotation_plans` (coluna JSON) —
rejeitado por fugir do padrão relacional do resto do esquema e dificultar consultas
simples (ex.: "qual o peso do atleta X no Fixo deste jogo").

## Decisão 2: Peso expresso numa escala discreta de 1 a 5, não um número livre

**Decisão**: `weight` é um inteiro de 1 a 5 (check constraint), com rótulos em
português na UI (ex.: 1 = "pouca confiança", 5 = "muita confiança") — nunca um campo
numérico arbitrário sem contexto.

**Rationale**: Princípio V da constituição (simplicidade pro treinador não-técnico) —
um campo numérico livre (ex.: "digite um peso de 0 a 100") exigiria o treinador
entender uma escala arbitrária sem significado óbvio. Uma escala curta e rotulada é
rápida de ajustar (ex.: um stepper +/-) e fácil de entender de relance, igual ao
padrão já usado pra aptidão (A/B/C, não um número).

**Alternatives considered**: Número livre (0-100) — rejeitado por complexidade
desnecessária pro caso de uso real (o treinador quer "um pouco mais" ou "bem mais",
não uma precisão de percentual). Escala maior (1-10) — rejeitada por não agregar
precisão útil numa decisão que já é subjetiva por natureza.

## Decisão 3: Peso inicial sugerido deriva de aptidão + estado, sempre editável

**Decisão**: Ao abrir o ajuste de pesos de um jogo pela primeira vez, cada atleta já
aparece com um peso pré-calculado: `pesoBase(aptidão) × fatorEstado(estado)`, por
vaga — ex.: A=5, B=3, C=1, sem classificação=1 (mas só se a vaga for habitual: fora de
`player_aptitudes`, o atleta nem aparece na vaga até o treinador adicioná-lo
manualmente); fator "a retomar" reduz esse peso base (ex.: metade, arredondado pra
baixo, mínimo 1); "indisponível" nunca aparece (ver FR-004). O treinador pode mudar
qualquer peso livremente a partir daí, inclusive pra uma vaga onde o atleta não tem
aptidão cadastrada (caso do exemplo Ala Esquerda-A/Fixo-B do spec).

**Rationale**: Resolve FR-003 — dá um ponto de partida sensato (nunca uma tela vazia
pedindo pro treinador preencher 20 atletas × 4 vagas do zero), mas nunca trava o
treinador na aptidão cadastrada, que é estável e não reflete a leitura da semana.

**Alternatives considered**: Pesos sempre começando vazios/zerados — rejeitado por
gerar trabalho repetitivo desnecessário (a aptidão já existe, é um bom ponto de
partida na maioria dos casos).

## Decisão 4: As 3 opções variam o número de turnos por atleta, não o total de tempo

**Decisão**: Pra cada vaga e parte, o tempo disponível é dividido entre os atletas
elegíveis proporcionalmente ao peso (`tempo_atleta = tempo_total × peso_atleta /
soma_pesos`), igual nas 3 opções (sem variação significativa, só arredondamento de
encaixe). O que muda entre as opções é em QUANTOS turnos esse tempo total de cada
atleta se divide:

- **Opção 1 ("Turnos longos")**: cada atleta recebe, sempre que possível, 1 turno
  contínuo com seu tempo total — menos substituições, menos desgaste de trocar.
- **Opção 2 ("Equilibrada")**: atletas com tempo total acima de um limiar (ex.: mais
  da metade da parte) têm seu tempo dividido em 2 turnos com uma pausa no meio
  (descanso); atletas com tempo menor continuam num turno só.
- **Opção 3 ("Mais rotativa")**: todo atleta com tempo total relevante é dividido em
  2+ turnos menores espalhados pela parte — mais trocas, descanso mais distribuído.

Dentro de cada opção, a ORDEM de entrada entre atletas de peso igual segue a ordem já
estabelecida por `suggestOrder` (specs/003-data-driven-rotation/) — nunca aleatória.

**Rationale**: Atende FR-006/SC-003 (mesmo total por atleta, variação no padrão) com
um critério concreto e explicável ao treinador (cada opção tem uma "personalidade"
reconhecível: mais contínua, equilibrada, ou mais rotativa) — nunca 3 resultados
aleatórios sem motivo aparente, o que seria confuso de explicar numa UI simples
(Princípio V).

**Alternatives considered**: 3 variações puramente aleatórias respeitando os pesos —
rejeitado por ser mais difícil de explicar ao treinador porque uma opção é diferente
da outra ("por que a opção 2 tem esse padrão e não outro?"); o critério por número de
turnos é determinístico e fácil de nomear/entender.

## Decisão 5: Um atleta ocupa só uma vaga por jogo gerado automaticamente

**Decisão**: Mesmo que um atleta tenha peso > 0 em mais de uma vaga pro mesmo jogo
(ex.: peso em Ala Esquerda E em Fixo), a geração automática aloca esse atleta numa
ÚNICA vaga — a de maior peso ajustado (empate resolvido pela ordem de `suggestOrder`).
Ele nunca é dividido entre duas vagas diferentes em horários diferentes dentro da
mesma geração automática.

**Rationale**: Evita o problema de conflito de horário entre vagas (um atleta não
pode estar em duas vagas ao mesmo tempo — já existe `playerOverlapsOtherSlot` no
motor manual pra evitar isso) sem precisar resolver isso automaticamente numa
primeira versão. Cobre exatamente o caso de uso citado no spec (treinador sobe o peso
do atleta no Fixo pra ele jogar ALI neste jogo) sem precisar que o sistema decida
também QUANDO trocar esse atleta de vaga no meio do jogo — essa decisão mais fina
continua manual (User Story 3, edição livre depois).

**Alternatives considered**: Permitir um atleta dividido entre 2 vagas na mesma
geração — rejeitado por complexidade desproporcional ao pedido original; o treinador
sempre pode fazer isso manualmente depois editando o plano gerado.
