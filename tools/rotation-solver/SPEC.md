# Especificação: gerador de planos de rotação de futsal

## 1. Objetivo

Dado um plantel, as posições que cada atleta pode ocupar, os minutos-alvo e as regras do treinador, gerar um ou mais **cenários de rotação** minuto a minuto para um jogo de futsal (sem guarda-redes), e exportá-los para Excel com grelha visual, tabela de quartetos e resumo comparativo.

O treinador ajusta regras e minutos; o programa volta a gerar. **As mudanças pedidas pelo treinador devem ser feitas no ficheiro de configuração, não no código.**

Ficheiros de referência que acompanham esta especificação:

| Ficheiro | O que é |
|---|---|
| `config_exemplo.json` | Configuração completa do jogo de 10/10 (cenário 2 final). |
| `rotacao_cenario1.json` | Rotação fornecida pelo treinador (cenário 1), usada como referência. |
| `solver_referencia.py` | Implementação de referência do motor (secção 4). Testada: gera solução válida. |

## 2. Por que o resultado "não fica próximo"

Uma abordagem heurística (preencher minuto a minuto, regras "se/então", trocas a cada X minutos) **não chega** a estes planos: as regras interagem (máx. seguidos × pausa mínima × um só atleta de apoio em campo × fecho com titulares × minutos-alvo × posições permitidas) e uma escolha cedo inviabiliza o fim da parte.

Os planos foram gerados com **programação linear inteira (MILP)**: o problema inteiro é descrito como variáveis binárias por minuto e restrições, e um solver encontra o melhor plano global. Esta é a peça essencial a reproduzir.

## 3. Entradas (`config.json`)

```jsonc
{
  "jogo": { "partes": 2, "minutos_por_parte": 30, "partes_iguais": false },
  "posicoes": ["Fixo", "Pivô", "Ala esquerda", "Ala direita"],
  "atletas": [
    { "nome": "Dinis", "papel": "principal", "posicoes": ["Fixo"], "alvo_min": 28 }
    // papel: "principal" | "apoio"; posicoes = onde PODE jogar; alvo_min = minutos no jogo completo
  ],
  "titulares": { "Fixo": "Dinis", "Pivô": "Cartucho", "Ala esquerda": "Felipe", "Ala direita": "Salvador" },
  "regras": {
    "tolerancia_min_principal": 4,     // total do jogo dentro de alvo ± 4
    "tolerancia_min_apoio": 1,         // apoio dentro de alvo ± 1
    "max_minutos_seguidos": 6,         // em campo, em qualquer posição
    "min_minutos_por_entrada": 3,      // cada entrada em campo dura pelo menos isto
    "min_minutos_pausa": 3,            // quem sai fica pelo menos isto no banco
    "min_minutos_na_posicao": 3,       // mudar de posição sem sair conta como novo bloco ≥ 3
    "max_apoio_em_campo": 1,           // nunca mais de 1 atleta "apoio" em campo
    "fecho_sem_apoio_min": 4,          // últimos 4 min de cada parte só com principais
    "fecho_com_titulares_min": 3,      // últimos 3 min de cada parte com os titulares nas suas posições
    "max_diferenca_entre_partes": 4,   // minutos de um atleta na 1.ª vs 2.ª parte
    "limites_posicao": [               // regras específicas por atleta e posição
      { "atleta": "Marcelo", "posicao": "Fixo", "max_por_parte": 4 },
      { "atleta": "Felipe",  "posicao": "Fixo", "min_por_parte": 9 },
      { "atleta": "Marcelo", "posicao": "Ala esquerda", "min_jogo": 4 }
    ]
  },
  "pesos": {                            // objetivo = soma ponderada (minimizar)
    "entrada": 8,                       // cada entrada em campo de qualquer atleta
    "momento_de_troca": 5,              // cada minuto em que acontece alguma alteração
    "inicio_em_posicao": 2,             // cada início de bloco numa posição (inclui mudanças de posição)
    "minuto_igual_ao_plano_referencia": 0.5, // >0 empurra para um plano DIFERENTE do de referência
    "minuto_de_titular_no_fecho": -1    // bónus por titular em campo nos minutos de fecho
  },
  "plano_referencia": "rotacao_cenario1.json", // opcional
  "solver": { "tempo_limite_s": 480 }
}
```

Para gerar vários cenários, usam-se várias configs (ex.: C2 = mesmas posições do C1; C3 = `posicoes` alargadas, p. ex. Martim também "Ala direita", Rayan também "Ala esquerda").

**Formato de um plano** (entrada de referência e saída do solver):

```json
{ "1": { "Fixo": [["Dinis", 0, 4], ["Marcelo", 4, 8], ...], "Pivô": [...], ... },
  "2": { ... } }
```
Cada segmento `[atleta, início, fim]` usa minutos da parte, fim exclusivo (`0–4` = minutos 0,1,2,3).

## 4. Algoritmo (MILP, passo de 1 minuto)

Índices: atleta `p`, posição `q`, parte `h`, minuto `t ∈ {0..N-1}` (N = 30).

### 4.1 Variáveis (todas binárias)
| Variável | Significado |
|---|---|
| `x[p,q,h,t]` | p joga na posição q no minuto t da parte h (só existe se q ∈ posições de p) |
| `on[p,h,t]` | expressão = Σ_q x[p,q,h,t] (p em campo) |
| `ent[p,h,t]` | p entra em campo no minuto t (`ent ≥ on[t] − on[t−1]`; em t=0 `ent = on[0]`) |
| `sai[p,h,t]` | p sai no minuto t (`sai ≥ on[t−1] − on[t]`) |
| `ini[p,q,h,t]` | p começa um bloco na posição q em t (`ini ≥ x[t] − x[t−1]`) |
| `mom[h,t]` | há alguma alteração no minuto t (`mom ≥ ini[·,·,h,t]` para todos) |

### 4.2 Restrições obrigatórias
1. Cada posição tem exatamente 1 atleta em cada minuto.
2. Cada atleta está no máximo numa posição por minuto.
3. Σ on[apoio] ≤ `max_apoio_em_campo` em cada minuto.
4. Titulares nas suas posições no minuto 0 de **cada** parte.
5. Fecho: apoio fora nos últimos `fecho_sem_apoio_min`; titulares nas suas posições nos últimos `fecho_com_titulares_min`.
6. Duração mínima de entrada: se `ent[p,h,t]=1` então `on[p,h,t+k]=1` para k=1..min−1 (só enquanto t+k < N; inclui t=0).
7. Pausa mínima: se `sai[p,h,t]=1` então `on[p,h,t+k]=0` para k=1..pausa−1 (só enquanto t+k < N).
8. Máximo seguido: em qualquer janela de `max+1` minutos consecutivos, Σ on ≤ max.
9. Bloco mínimo na posição: se `ini[p,q,h,t]=1` então `x[p,q,h,t+k]=1`, k=1..min_posicao−1.
10. Minutos totais: `alvo − tol ≤ Σ_{h,t} on[p,h,t] ≤ alvo + tol`.
11. Equilíbrio entre partes: |min. parte 1 − min. parte 2| ≤ `max_diferenca_entre_partes`.
12. `limites_posicao` (min/max por parte ou por jogo).
13. Se `partes_iguais`: x[p,q,2,t] = x[p,q,1,t].

### 4.3 Objetivo (minimizar)
```
8·Σent + 5·Σmom + 2·Σini + 0.5·(minutos iguais ao plano de referência) − 1·(minutos de titulares nos minutos de fecho)
```
- **Σent** alto ⇒ muitas entradas curtas. Penalizar dá entradas longas e menos idas ao banco.
- **Σmom** ⇒ junta trocas no mesmo minuto (menos paragens).
- **Σini** ⇒ evita mudanças de posição desnecessárias.
- O termo de referência é **opcional** e só serve para obrigar um cenário alternativo a ser diferente.

### 4.4 Solver
- Python + **PuLP 2.9.0** + **HiGHS** (`pip install "pulp==2.9.0" highspy`). ⚠️ PuLP 3/4 alterou a API (`LpVariable(cat=...)` falha). Usar 2.9.
- Tamanho: ~10 atletas × 4 posições × 60 minutos ≈ 2 400 binárias + auxiliares. Com limite de **150–480 s** dá soluções boas; a prova de ótimo pode não terminar, aceitar a melhor encontrada.
- Correr cenários em paralelo, em segundo plano, se o ambiente tiver limite de tempo por comando.
- Se ficar **inviável**, relaxar por esta ordem: tolerâncias de minutos → `max_minutos_seguidos` → `fecho_com_titulares_min` → limites por posição. Reportar ao utilizador qual foi relaxada.

## 5. Pós-processamento

1. **Segmentos**: percorrer cada posição minuto a minuto e juntar minutos consecutivos do mesmo atleta.
2. **Momentos de troca**: conjunto dos inícios de segmento > 0 em qualquer posição.
3. **Tabela de quartetos** (uma linha por intervalo entre momentos): parte, minutos da parte, minutos do jogo (parte 2 = +30), atleta em cada posição, e:
   - **Entram** = em campo agora e não no minuto anterior (ordem: Fixo, Pivô, Ala esq., Ala dir.).
   - **Saem** = em campo no minuto anterior e não agora.
   - **Mudam de posição** = estavam e continuam, noutra posição → `"Nome: Posição nova"`, separados por `; `.
   - Linha do minuto 0 = "Quarteto inicial".
4. **Estatísticas por atleta**: minutos por posição e total (jogo completo), banco = 60 − total, **máximo seguido** (maior bloco em campo dentro de uma parte, somando mudanças de posição sem sair), **maior pausa** (maior intervalo no banco entre duas entradas da mesma parte; "—" se só tem uma entrada), **n.º de entradas**.

## 6. Validação automática (falhar se algo não cumprir)
- 4 atletas distintos em campo em todos os minutos; cobertura 0–N sem buracos.
- Nenhum atleta fora das suas posições.
- Apoio em campo ≤ 1 em todos os minutos.
- Máx. seguidos, pausa mínima e entrada mínima respeitados.
- Totais: soma = 4 × 60 = 240 min; cada atleta dentro da tolerância.
- Fecho cumprido nas duas partes.

## 7. Saída Excel (openpyxl)

Folhas, por esta ordem: **Resumo**, **Cenário 1..k**, **Atletas**, **Registos**.

**Registos** (fonte única de dados): colunas `Cenário | Parte | Posição | Atleta | Início parte | Fim parte | Duração (=F−E) | Início jogo | Fim jogo`. Uma linha por segmento.

**Cenário k** (paisagem, ajustar à largura):
- Título `Cenário k: descrição` e legenda com as regras do cenário.
- Duas grelhas (1.ª e 2.ª parte): linha "Minutos" com 0..30 (uma coluna por minuto, largura ≈ 5,6), e 4 linhas (Fixo, Pivô, Ala esq., Ala dir.), altura ≈ 48.
- **Sem células unidas** na grelha. Cada minuto de um segmento é uma célula com o preenchimento da linha; borda **média escura** em cima e em baixo, à esquerda da 1.ª célula e à direita da última (uma caixa por entrada); entre minutos, borda **fina cinzenta** (`#B8C4CE`), para manter a escala por minuto.
- Texto só na 1.ª célula, alinhado à esquerda, sem quebra, a transbordar: fórmula `=" "&Registos!D{r}&" "&Registos!E{r}&"–"&Registos!F{r}`; se o segmento tiver ≤ 2 min, só o nome.
- Abaixo: tabela de quartetos (secção 5.3), com linhas alternadas e cabeçalho escuro; as colunas de atletas são fórmulas para `Registos!D{r}`.

**Resumo**: (1) minutos em campo por cenário (`SUMIFS` sobre Registos por Atleta e Cenário) com total 240; (2) ritmo: máximo seguido, maior pausa e n.º de entradas por cenário; (3) por cenário, minutos por posição (`SUMIFS` com Posição) e total.

**Atletas**: atleta, posições permitidas em cada cenário, papel; parâmetros (partes, minutos por parte, minutos de jogo = fórmula) e notas com as regras usadas.

Estilo: cabeçalhos `#18364C` com texto branco, texto `#183042`, linhas alternadas `#EEF2F5`, preenchimentos da grelha `#DDEAF4` / `#E8EFEB` alternados por linha, números com formato `0" min"`.

Depois de gravar, **recalcular** com LibreOffice (`soffice --headless`) para gravar os valores das fórmulas, e verificar que não há erros. Exportar para PDF e ver as páginas da grelha.

## 8. Armadilhas conhecidas
- LibreOffice reescreve `'Registos'!D5` como `Registos!D5`; qualquer regex que remapeie referências deve aceitar as aspas como opcionais. Mais simples: **regenerar** todas as fórmulas a partir dos dados em vez de as remapear.
- Bordas em células unidas não aparecem bem em vários visualizadores; por isso a grelha não usa células unidas.
- `copy_worksheet` do openpyxl não copia configuração de impressão; definir orientação, ajuste à página e área de impressão à mão.
- Regras "duras" demais deixam o modelo inviável ou lento; preferir tolerâncias e pesos.

## 9. Fluxo de iteração com o treinador
1. Traduzir cada comentário numa alteração de `config.json` (alvo de minutos, posições permitidas, limite por posição, peso).
2. Voltar a correr o solver para os cenários afetados; validar (secção 6).
3. Regenerar o Excel inteiro (não editar à mão).
4. Responder com uma tabela "antes → depois" dos minutos e os custos da mudança (pausas maiores, mais trocas, etc.).

Exemplos já usados nesta conversa:
| Pedido do treinador | Alteração na config |
|---|---|
| "Fixo roda entre Felipe e Dinis; Marcelo só apoia o fixo e roda nas alas" | `limites_posicao`: Marcelo/Fixo `max_por_parte: 4`; Felipe/Fixo `min_por_parte: 9`; Marcelo/Ala esq. e Ala dir. `min_jogo: 4` |
| "Acabar as partes com a equipa mais forte" | `fecho_sem_apoio_min: 4`, `fecho_com_titulares_min: 3` |
| "Experientes mais tempo seguido em campo" | subir peso `entrada`; subir `min_minutos_por_entrada` dos principais |
| "Cenário com posições diferentes" | alargar `posicoes` dos atletas polivalentes |

## 10. Prompt sugerido para o Claude Code
> Implementa o gerador descrito em `SPEC.md`. Usa `solver_referencia.py` como base do motor (não substituas o MILP por heurísticas). Cria: `gerar.py` (lê uma ou mais configs, corre o solver, valida segundo a secção 6), `exportar_excel.py` (secção 7) e testes que validam o `rotacao_cenario1.json` e uma saída do solver. Executa com `config_exemplo.json` e mostra-me a grelha gerada.
