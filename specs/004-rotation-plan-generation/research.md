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

## Decisão 6 (2026-10-09, mesmo dia): Peso domina de verdade — sem decaimento contínuo por tempo acumulado

**Histórico**: a primeira implementação da Decisão 4 usava `peso / (1 + tempo
acumulado)` como pontuação — isso parecia justiça proporcional, mas na prática fazia
o peso perder força ao longo do jogo: um atleta sem nenhuma aptidão numa vaga (peso 1,
o padrão de qualquer atleta sem classificação lá) podia acabar entrando porque quem
tinha peso 5 já tinha "acumulado demais" e seu score decaía abaixo do score do atleta
de peso 1 (que começa em 0 acumulado). Feedback real do treinador, com um caso
concreto: "Dinis que tem 1 na posição de Pivô, está tendo minutos lá" — Dinis nunca
deveria pegar minutos no Pivô se existe alguém com peso de verdade pra essa vaga.

Essa mesma conversa trouxe mais 3 pontos a atender: (1) não é saudável ter as 4 vagas
trocando sincronizadas o tempo todo — pode ser UMA das opções, nunca a regra; (2)
geralmente deve haver uns 3 atletas "mais capacitados" em quadra, misturados com quem
tem menos experiência — não um rodízio raso entre todo mundo; (3) um atleta pode
somar mais de 5 min "em quadra" rodando entre 2 vagas (ex.: 3 min numa + 3 min noutra
= 6 min), o que é preferível a tirá-lo de quadra só pra cumprir uma regra de tempo;
(4) quando o desequilíbrio de peso entre o melhor e as alternativas é grande, o tempo
do melhor deve esticar — não forçar troca só porque "já passou 5 minutos".

**Decisão**: Trocar a pontuação contínua por peso + um desconto pequeno e fixo
(`REPEAT_PENALTY = 2`, numa escala de 1-5) só quando o atleta acabou de vir da MESMA
vaga na janela anterior — nunca um decaimento que cresce sem limite com o tempo. Isso
faz o peso realmente mandar: uma diferença grande (ex.: 5 vs. 1) nunca é superada pelo
desconto; só diferenças pequenas (ex.: 5 vs. 4, ou empates) fazem o rodízio valer a
pena. Corrigido junto um bug real descoberto na mesma revisão: a vaga "de onde o
atleta veio" (`lastSlot`) não estava sendo resetada quando ele ficava de fora de uma
janela inteira — podia ficar bloqueado de voltar pra sua vaga favorita por várias
janelas seguidas sem nunca ter sido realocado em lugar nenhum nesse meio tempo.
Reconstruído do zero a cada janela: só conta como "veio dessa vaga" quem foi
efetivamente escalado nela na janela IMEDIATAMENTE anterior.

**Rationale**: Resolve o caso concreto relatado (confirmado ao vivo: um atleta de
peso 5 cadastrado só no Pivô passou a ocupar o Pivô o jogo inteiro, zero minutos pro
atleta de peso 1 lá) e, como efeito direto do mesmo mecanismo, atende os pontos (2) e
(4) acima: o "desconto pequeno e fixo" é exatamente o que faz o rodízio só acontecer
entre pesos PRÓXIMOS (nunca força uma troca pra um claramente pior) — nunca todas as
vagas mudam juntas por regra, só quando a disputa de peso daquela vaga especificamente
justifica. O ponto (3) já é consequência do rodízio de posição (Decisão 4 acima): um
atleta com peso em 2 vagas é escalado ora numa ora noutra, acumulando mais tempo total
que se estivesse travado numa vaga só. O ponto (1) ("não sincronizar as 4 vagas") fica
parcialmente em aberto — na prática, quando VÁRIAS vagas têm disputa de peso parecida
ao mesmo tempo na escalação, é esperado que várias troquem perto do mesmo momento
(nenhum motor "esconde" trocas que genuinamente deveriam acontecer); se isso ainda
incomodar depois de usar com dados reais, precisa de um caso concreto pra investigar
se é desenho ou um efeito colateral a corrigir.

**Alternatives considered**: Manter o decaimento contínuo mas com um fator de
suavização menor (ex.: `peso / (1 + acumulado/60)`, em minutos em vez de segundos) —
rejeitado por ainda ter o mesmo problema de fundo (eventualmente qualquer decaimento
contínuo sem teto permite um peso baixo "alcançar" um peso alto dado tempo
suficiente); o desconto fixo por repetição nunca tem esse problema, porque não cresce.

## Decisão 7 (2026-10-09, mesmo dia): Pressão de troca escalona por sequência — e as 3 opções são filosofias de rotação, não tamanhos de turno

**Histórico**: a Decisão 6 corrigiu o caso relatado (Dinis não rouba mais minutos do
Pivô), mas foi longe demais na direção oposta — testado ao vivo, um atleta de peso 5
cadastrado só no Pivô passou a ocupar a vaga **o jogo inteiro**, zero rotação real
mesmo tendo tempo de sobra pra ceder. Feedback do treinador, em duas mensagens da
mesma conversa:

> "Outro ponto, não precisamos e não é saudável termos os 4 girando o tempo todo,
> pode ser uma das opções, mas não regra. Precisamos também ter sempre 3 jogadores
> mais 'capacitados' com jogadores com menos experiência. Em alguns casos, se for
> para otimizar o processo, algum atleta pode ficar 3 min em uma posição e 3 em
> outra totalizando 6 min. Outra questão, quando o desequilibrio entre as opções
> forem grandes, pode esticar o tempo do 'melhor'"

> "Ainda não está legal, precisamos equilibrar os tempo, fazer atletas que jogam em
> 2 ou 3 posições poderem rodar. Até 6 minutos em quadra, ok. Não acho que as opções
> deveriam ser somente por tempos diferentes, mas sim rotações diferentes baseado nas
> opções."

Essa segunda mensagem invalida a leitura que eu tinha dado à primeira (eu havia
assumido que o "desconto pequeno e fixo" da Decisão 6 já resolvia o ponto por
consequência, sem mudança de código) — o comportamento de "quem tem peso nunca sai"
é explicitamente chamado de "não legal" depois de visto ao vivo. Fica claro também
que o eixo das 3 opções estava errado desde a Decisão 4: variar só o TAMANHO da
janela (5/3/2 min) nunca mexe em QUEM joga, só na granularidade — não são 3
estratégias diferentes, são a mesma estratégia em 3 resoluções.

**Decisão**: A janela fica FIXA em 5 minutos pras 3 opções (teto rígido, igual antes
— nenhuma vaga reavalia depois de mais que isso). O que varia entre as 3 opções agora
é **quantas janelas SEGUIDAS (streak) um atleta pode segurar a mesma vaga antes da
pressão pra trocar virar grande o bastante pra vencer qualquer vantagem de peso**
(`FORCE_OUT_PENALTY = 10`, maior que qualquer diferença possível numa escala 1-5):

- **"Foco nos mais aptos"** (`streakLimit = 3`, até 15 min seguidos): o peso manda
  quase sempre; só cede depois de um streak longo.
- **"Equilibrada"** (`streakLimit = 2`, até 10 min seguidos): meio-termo.
- **"Dá minutos a todos"** (`streakLimit = 1`, nunca mais que 5 min seguidos): até o
  atleta claramente melhor cede a cada janela.

Enquanto o streak não estourou o limite, o desconto continua pequeno e fixo
(`REPEAT_PENALTY = 2`, Decisão 6, inalterado) — só decide entre pesos próximos, nunca
derruba uma vantagem grande. O resto do mecanismo (janela fixa de 5 min, rodízio de
posição pra quem tem peso em mais de uma vaga, `lastSlot` reconstruído do zero a cada
janela) continua exatamente como a Decisão 6 deixou.

**Rationale**: Resolve o caso ao vivo (nenhuma opção segura uma vaga o jogo inteiro
mais — mesmo "Foco nos mais aptos" força uma saída periódica) sem reintroduzir o
problema que a Decisão 6 corrigiu (o desconto por streak-estourado só vence peso
porque é deliberadamente maior que qualquer gap possível — nunca um decaimento
contínuo que qualquer peso baixo eventualmente "alcança"). Atende aos pontos da
primeira mensagem como consequência direta do rodízio de posição já existente (um
atleta com peso em 2-3 vagas naturalmente soma mais que 5 min TOTAL girando entre
elas, sem nenhuma trava explícita de "6 minutos" — basta ele continuar tendo peso
relevante em mais de uma vaga) e do próprio streak-limit (ninguém mais trava uma vaga
o jogo inteiro, logo sempre sobra espaço pra quem tem menos experiência entrar). O
ponto mais importante da segunda mensagem — as 3 opções precisam ser 3 filosofias de
rotação, não 3 tamanhos de turno — é atendido trocando o eixo de variação de "duração
da janela" pra "tolerância a sequência", que de fato produz escalações diferentes
entre as opções (não só turnos mais curtos do mesmo padrão).

**Alternatives considered**: Manter as 3 opções variando o tamanho da janela, só
ajustando o desconto por janela maior — rejeitado por ser exatamente o que a segunda
mensagem do treinador pede pra não fazer ("não acho que as opções deveriam ser
somente por tempos diferentes"). Limitar o tempo TOTAL acumulado por atleta por vaga
(um teto de minutos, não de janelas seguidas) — rejeitado por reintroduzir uma forma
de equilíbrio de minutos que a Decisão 6 já rejeitou explicitamente (o objetivo não é
"todo mundo com tempo parecido", é "ninguém trava uma vaga pra sempre"); um limite de
streak (janelas seguidas) ataca exatamente esse sintoma sem impor igualdade de tempo
total.

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
