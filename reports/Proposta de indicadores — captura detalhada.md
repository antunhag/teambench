# Proposta de indicadores — captura detalhada

> Documento de trabalho, não uma spec formal. Objetivo: fechar a lista de
> indicadores/tipos de evento antes de voltar ao desenho visual (Mock E) ou
> escrever `/speckit-specify`. Cruza [o levantamento de indicadores de
> futsal](Indicadores%20de%20estatísticas%20no%20futsal.md) com o que já
> existe em `packages/engine/src/types.ts` e com as decisões já tomadas nos
> mockups A-E.
>
> **Status: em validação com o treinador, última revisão 2026-10-16.**
> As decisões aqui já são definitivas quando marcadas "Decidido"/"Revisto";
> o documento ainda recebe ajustes à medida que o mockup avança.

## Resumo executivo

- **8 tipos de evento novos** no motor, todos de baixa complexidade (tally
  simples ou tally+2-3 campos) — nenhum mexe no relógio/estado de jogo
  (`onCourt`/`clockAcc`/`score`), só se acrescentam ao registo cronológico.
- **1 "indicador" que afinal não precisa de nenhum tipo novo** — o duplo
  pénalti já é 100% representável com o que já existe ou está já proposto
  aqui (boa notícia, menos trabalho do que parecia).
- **`remate`/`golo.tipo` não se repete à mão quando já foi marcado por
  outro evento** (transição, posse) — resolvido via derivação automática
  pelo contexto, não um campo novo (ver secção 1).

## Convenção

Nomes de tipo em minúsculas com underscore, em português — mesmo padrão já
usado (`golo_sofrido`, `cartao_amarelo`, `lesao_inicio`). Todos os novos
tipos abaixo guardam `playerId` (quem fez a ação, quando aplicável) e
reaproveitam o relógio de jogo (`ms`/`min`/`sec`/`period`) do jeito que todo
evento já faz hoje.

---

## 1. Remate (não resulta em golo)

**Novo tipo**: `remate`

| Campo | Valor | Nota |
|---|---|---|
| `desfecho` | `"defendido"` \| `"fora"` \| `"bloqueado"` | nunca `"golo"` — isso continua a ser o evento `golo` já existente, intacto |
| `zona` | 1-12 (`ZONAS_GOLO`) | **revertido para a escala fina já usada pelo golo** (ver nota abaixo — a escala de 6 tinha sido criada só pro campo tático do Mock D, que já foi deixado de lado) |
| `tipo` | mesmos valores de `golo.tipo` (org/trs/atr/cnt/lat/lvr/pnt/l10/gll/ppb) | **derivado automaticamente quando possível — ver abaixo** |
| `playerId` | quem rematou | opcional/não-bloqueante (decidido no Mock E) |

`golo`/`golo_sofrido` ficam exatamente como estão — `remate` é só pros 3
desfechos que não marcam. "Total de remates" vira uma soma simples de
`golo` + `remate` na camada de relatório, não um campo novo.

**Decidido — `remate`/`golo` herdam o `tipo` do golo, mas sem pedir pra
marcar duas vezes a mesma coisa.**
O treinador apontou um problema real: um remate pode ser a conclusão de
uma transição já marcada — se o diretor já tocou "Transição ganha" pra
aquela jogada, não devia precisar de tocar "Transição" outra vez ao
marcar o remate que a conclui. Isso vale igualmente pra "Ataque rápido"
(`atr`), que eu não tinha reparado no primeiro rascunho: um `atr` também
é só um `recuperacao` seguido de um remate — a mesma redundância.

Resolução: no ecrã de captura detalhada, `tipo` **não é perguntado outra
vez** quando já é dedutível do que acabou de ser marcado — `trs` fica
implícito quando o remate vem logo depois de uma `transicao` ganha; `atr`
fica implícito quando vem logo depois de uma `recuperacao`; `org` fica
implícito quando a fase ativa (`fase_jogo`, secção 6) é "organização
ofensiva" e nada mais aconteceu antes. O diretor só escolhe `tipo` à mão
pros casos que genuinamente não têm nenhum evento anterior que os
entregue de graça — os tipos de bola parada (`cnt`/`lat`/`lvr`/`pnt`/`l10`/
`gll`/`ppb`). O CAMPO continua a existir com os mesmos valores de
sempre (preserva compatibilidade com `describeEvent`/relatórios já
existentes) — só deixa de exigir um toque a mais pra repetir informação
que outro evento já deu.

**Revisto — zona volta, com a escala fina (12), e passa a cobrir também
falta/falta sofrida/livre.** A ronda anterior tinha deixado `zona` de fora
do Mock E (ele saiu do campo tático pro layout em linhas+painel) e, quando
voltasse, cogitava a escala mais grossa (6) criada só pra caber as duas
balizas no campo tático do Mock D. Como o Mock D já foi deixado de lado, não
há razão pra manter essa escala mais pobre — volta a ser a mesma de sempre
(`ZONAS_GOLO`, 1-12), a mesma que o golo já usa. Importante: isto NÃO é o
campo tático de volta — é o mesmo `.zonegrid`/`zbtn` que a Registo e o Jogo
ao vivo já usam hoje pro golo (uma grelha de 12 botões numerados, não um
desenho espacial do campo) — um passo rápido depois do desfecho, não um
gráfico em permanência no ecrã.

Também passa a existir `zona` em `falta` e `falta_sofrida` (campo novo —
não existia pra estes dois tipos até agora). Não cria nenhum tipo `livre`
separado: a zona de uma falta já É a zona de onde o livre resultante vai
ser cobrado — mesmo local, um só campo. *(Minha leitura do pedido — se
"livre" queria dizer outra coisa, diz que eu ajusto.)*

---

## 2. Posse

**Novos tipos**: `perda`, `recuperacao`

Simples — só `playerId` opcional, sem zona nem subtipo. A pesquisa não
sustenta nenhuma granularidade adicional aqui que valha a pena pra v1.

---

## 3. Transição

**Novo tipo**: `transicao`

| Campo | Valor |
|---|---|
| `direcao` | `"ofensiva"` \| `"defensiva"` |
| `resultado` | `"ganha"` \| `"perdida"` |
| `numeros` | ex. `"3x1"`, `"2x1"` — mesmos presets de `TRANSICAO_NUMEROS_VANTAGEM`/`TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM` (`goalTypes.ts`) | **o dado principal deste evento — ver nota abaixo** |

Mesmo padrão de cluster já validado nos mockups A/D/E (seta vermelha /
ícone / check azul).

**Revisto — o ponto da transição é a vantagem numérica, não quem roubou a
bola.** O treinador corrigiu o rascunho original: transição é a jogada em
que uma equipa recupera a bola e ataca com a outra "a correr de costas" —
o que vale a pena registar é COMO foi essa transição (3x1, 2x1...), não
de quem foi o roubo (isso já é o `recuperacao`/`perda`, separado). Por
causa disso, `transicao` **não tem faixa de atribuição a jogador** — ao
contrário dos outros eventos de equipa (bola parada ganha, ações
defensivas, goleiro-linha), que mantêm essa opção.

**Definição de `resultado` — decidida, não é padrão de nenhuma literatura.**
Perguntei se "ganha" devia exigir golo; conferi a pesquisa antes de
responder e não achei nenhuma fonte que defina esse binário formalmente —
só o padrão geral de tratar "chegou ao remate" e "golo" como duas
contagens separadas (ex.: o estudo da Seleção na Liga Mundial 2008 mede
"finalizações e golos" lado a lado, não um só). Com base nisso, e no
objetivo real do treinador (ver abaixo), fica definido:

> **`ganha`** = a transição chegou a um remate (golo ou não).
> **`perdida`** = a equipa teve a vantagem numérica mas NÃO chegou a
> rematar — o adversário recuperou/organizou a tempo antes disso.

**Por que isto importa pro relatório, não só pra captura.** O objetivo
declarado do treinador pra esta métrica é destacar depois do jogo **as
transições perdidas, principalmente as que tínhamos superioridade
numérica** — ex.: "tivemos um 3x1 e nem rematámos" é um alerta real de
coaching. Isso só é possível de mostrar automaticamente se `resultado` é
um critério objetivo e fácil de marcar ao vivo (chegou ao remate: sim/não)
— se dependesse de julgamento subjetivo sobre "será que aproveitámos bem",
o dado ficaria inconsistente entre jogos. Esta é uma funcionalidade de
**relatório/resumo pós-jogo** (filtrar `direcao=ofensiva` + `resultado=
perdida` + `numeros` nos presets de vantagem de `TRANSICAO_NUMEROS_
VANTAGEM`), não do ecrã de captura ao vivo — vale anotar como critério de
sucesso explícito quando escrevermos a spec, mas não precisa de mais
nenhuma ronda de mockup agora.

---

## 4. Guarda-redes

**Novos tipos**: `defesa`, `saida`

- `defesa` — a parada em si (hoje só existe o reverso, `golo_sofrido`
  quando a defesa FALHA; não existe registo nenhum de quando o
  guarda-redes defende com sucesso). Campos: `playerId`, `zona` (1-12,
  `ZONAS_GOLO` — corrigido: era "escala nova de 6" numa versão anterior
  deste documento, mas essa escala só existia por causa do campo tático,
  já shelved; com remate/falta/falta sofrida todos na escala fina, não faz
  sentido o guarda-redes ficar como a única exceção).
- `saida` — situação de 1x1. Campo: `resultado`: `"ganho"` \| `"perdido"`.

**Não incluído por agora**: reposição/distribuição (`reposicao`) — a
pesquisa encontrou evidência fraca de que isto tem alguma convenção de
registo que valha a pena (uma fonte achou só 3,85% de sucesso em
contra-ataques originados de reposição, sem padrão estabelecido de como
medir). Fica de fora da v1 em vez de inventar um indicador sem base.

---

## 5. Goleiro-linha (5º jogador de linha)

**Novos tipos**: `goleiro_linha_inicio`, `goleiro_linha_fim`

Mesmo padrão já usado por `pausa`/`fim_pausa` e `lesao_inicio`/`lesao_fim`
— marca o início/fim da janela em que a equipa está a jogar com o
guarda-redes como 5º jogador de linha. Qualquer `remate`/`transicao`/`golo`
que aconteça dentro dessa janela já fica implicitamente identificável
cruzando os timestamps — sem precisar de repetir uma flag em cada evento.

**Decidido: sim**, adicionar os dois eventos de estado, e manter
`transicaoBalizaDeserta` como está. Hoje já existe `golo.transicaoBalizaDeserta`
(um booleano, só pra golos marcados com a baliza adversária vazia) — a
pesquisa trata goleiro-linha como merecendo os próprios campos de
situação/zona/resultado, inclusive quando NÃO termina em golo (o que a
flag atual não cobre, já que só existe se houver golo). São coisas
diferentes ("a equipa está a jogar em goleiro-linha" vs. "este golo
específico encontrou a baliza vazia") — não há conflito em manter os dois.

---

## 6. Fase de jogo

**Novo tipo**: `fase_jogo`

| Campo | Valor |
|---|---|
| `fase` | `"organizacao_ofensiva"` \| `"organizacao_defensiva"` \| `"transicao_ataque_defesa"` \| `"transicao_defesa_ataque"` |

**Decidido: grava como evento de verdade**, não como um toggle sem
persistência (o Mock D/E tinha tratado como toggle). O resto do app é
**sempre** event-sourced — nunca um campo que só mostra o "agora" e
esquece o antes (é literalmente o Princípio I da constituição: nunca
reescreve/esquece o passado). Cada troca do diretor cria um evento
`fase_jogo` novo — dá pra reconstruir quanto tempo a equipa passou em
cada fase, de graça, e é o que alimenta a derivação automática de `tipo`
descrita na secção 1 (`org` implícito quando a fase ativa é "organização
ofensiva").

---

## 7. Ações defensivas genéricas

**Novo tipo**: `acao_defensiva`

| Campo | Valor |
|---|---|
| `subtipo` | `"desarme"` \| `"intercecao"` \| `"bloqueio"` |

Sem zona, sem outros campos — a própria pesquisa mostra que isto é pouco
formalizado até na literatura académica. Fica deliberadamente simples.

---

## 8. Duplo pénalti / livre sem barreira (falta acumulada)

**Nenhum tipo novo necessário** — boa notícia. Já existe tudo:

- `periodFouls`/`periodFoulsAdvers` (contagem de faltas da parte) já
  existe no motor e já tem aviso visual a partir de 5
  (`apps/web/src/match/LiveMatch.tsx:283`).
- `golo.tipo === "l10"` ("Livre direto 10 metros") já existe na taxonomia
  de golo.
- `remate` herda `tipo` (secção 1), então um remate falhado dessa mesma
  situação já fica coberto também, sem nada novo.

**Decidido — regra confirmada pelo treinador**: a 5ª falta acumulada da
equipa na parte é só aviso (o aviso visual que já existe em `>= 5` está
certo, não precisa mudar); a **6ª falta** é que vira livre direto de 10
metros sem barreira — bate com a fonte FIFA/AFA da pesquisa, não com a
fonte espanhola secundária que dizia 5ª. Vale acrescentar um aviso visual
mais forte especificamente em `>= 6` (hoje o estilo `warn` não distingue
"a aproximar-se" de "já é livre direto") — refinamento de UI pequeno, não
bloqueia o resto desta proposta.

---

## Fora de escopo (de propósito, por agora)

- **Pressão/sistema defensivo** (marcação individual/zona/mista, "linha
  1-4") — a pesquisa encontrou pouco vocabulário nativo do futsal pra
  isto (maioria importado do futebol); fica pra mais tarde, não há
  convenção clara o suficiente pra codificar agora.
- **Numérica após cartão vermelho** (4x5/5x4 fora do contexto
  goleiro-linha) — a pesquisa não achou nenhuma fonte sobre isto; não há
  base pra desenhar um indicador ainda.
- **Zona no `defesa` com técnica** (mãos/pés, com/sem queda) — mencionado
  na pesquisa mas fica como refinamento futuro, não v1.
