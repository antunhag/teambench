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

## Decisão 4 (revista 2026-10-09): Escalonamento por janelas de tempo, com teto de 5 minutos e rodízio de posição

**Histórico**: a primeira versão desta feature (Decisões 4/5 originais, abaixo)
prendia cada atleta a UMA vaga só por geração, com turnos podendo chegar a ocupar a
parte inteira sem troca ("Turnos longos"). Feedback direto do treinador depois de
usar em produção: "Os planos deixam muito tempo na quadra. Temos que ter jogadores
rodando 5 minutos no máximo, jogadores que podem rodar de posição dentro da quadra."
Isso invalidou as duas decisões originais — revisadas aqui.

**Decisão**: Cada parte é dividida em janelas de tempo fixas (nunca mais que 5
minutos — teto rígido, nunca ultrapassado em nenhuma das 3 opções). A cada janela, o
sistema decide de uma vez só quem entra em cada uma das 4 vagas: entre os pares
(vaga, atleta) ainda válidos — atleta com peso cadastrado pra aquela vaga — fecha
primeiro o par de maior pontuação (`peso / (1 + tempo já acumulado pelo atleta)`),
numa correspondência gulosa determinística (nunca sorteio). Um atleta com peso
cadastrado em mais de uma vaga pode ser escolhido numa janela pra uma vaga e na
janela seguinte pra outra — ele RODA DE POSIÇÃO dentro do próprio jogo, não fica mais
preso a uma vaga só (Decisão 5 original, abaixo, foi revogada). As 3 opções variam só
o tamanho da janela — "Até 5 minutos" / "Até 3" / "Até 2" por turno — dando mais ou
menos frequência de troca; o tempo total por atleta fica próximo entre as 3 (não mais
exatamente igual como na versão anterior, já que a correspondência é gulosa, não uma
divisão proporcional fechada — ainda assim dentro da margem já prevista em FR-006/
SC-003, "sem variação significativa").

**Rationale**: Atende o pedido literal do treinador (teto de 5 min, nunca mais) e
reaproveita o mesmo peso por vaga já existente pra permitir rodízio de posição sem
precisar de nenhum dado novo — um atleta com peso alto em 2 vagas naturalmente
alterna entre elas conforme o "custo" de mantê-lo tempo demais numa só vaga sobe
(`1 + acumulado` no denominador). Resolve ao mesmo tempo o problema de conflito de
horário (um atleta nunca pode estar em 2 vagas na mesma janela, já que cada janela
marca quem já foi escolhido antes de processar a próxima vaga) sem precisar de um
solver de otimização completo — a correspondência gulosa por janela é simples de
implementar, testar e explicar ("quem está escalado em cada vaga nos próximos X
minutos").

**Alternatives considered**: Resolver a alocação inteira do jogo como um problema de
otimização global (ex.: programação linear) pra maximizar aderência exata ao peso —
rejeitado por complexidade desproporcional a uma ferramenta pro treinador usar em
campo; a correspondência gulosa por janela já entrega resultado bom o suficiente,
sempre determinístico, e muito mais fácil de auditar/explicar numa mensagem de erro
ou revisão de código.

---

### Decisões originais (2026-10-09, revogadas pela revisão acima — mantidas por histórico)

**Decisão 4 original**: As 3 opções variavam o NÚMERO DE TURNOS por atleta (via
`chunksFor`/`buildStints`, com `maxStintSec` = período inteiro / metade / um terço),
nomeadas "Turnos longos" / "Equilibrada" / "Mais rotativa" — mas "Turnos longos"
podia dar até a parte inteira num turno só, exatamente o que o treinador reportou
como problema.

**Decisão 5 original**: Um atleta ocupava só UMA vaga por geração (a de maior peso,
via `assignSlots`), nunca dividido entre vagas na mesma geração — trocado de vaga só
manualmente depois. Revogada porque o pedido do treinador foi explicitamente permitir
rodízio de posição dentro do próprio jogo gerado.
