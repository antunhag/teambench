# Quickstart: Captura detalhada de estatísticas

Validação manual, sempre contra um jogo de teste — nunca um jogo real
agendado (Princípio IV). Esta tela assume um ecrã largo — testar em
viewport tablet/landscape (ex. `resize_window` do browser de testes), não
no viewport de telemóvel que o resto da app usa.

## Pré-requisitos

- Um jogo de teste, qualquer estado (`scheduled` serve pra testar o apito).
- `npm test --workspace packages/engine` passando (cobre as 10 funções
  novas, a derivação de `tipo`, e o filtro de transições desperdiçadas).

## Cenário 1 — US1: um jogo inteiro só pela tela nova

1. Abrir um jogo de teste ainda não iniciado; abrir a aba nova ("Captura
   detalhada" ou nome equivalente).
2. Escolher titulares, dar o apito — **esperado**: relógio da parte começa,
   igual ao "Jogo ao vivo".
3. Fazer uma substituição (tocar no suplente, tocar na linha de quem sai)
   — **esperado**: minutos do jogador que sai param, os do que entra
   começam.
4. Iniciar um pedido de tempo, terminar — **esperado**: minutos
   descontados de quem estava em quadra. Repetir com "outro motivo" —
   **esperado**: ninguém perde minutos.
5. Marcar um golo, um cartão, uma falta — **esperado**: aparecem no
   registo cronológico exatamente como "Jogo ao vivo" produziria.
6. Terminar a parte e, depois, o jogo.
7. Abrir o Resumo — **esperado**: golos, cartões, faltas, substituições e
   minutos por atleta corretos, sem diferença nenhuma por terem sido
   registados pela tela nova.

## Cenário 2 — US2: zona opcional em remate/falta/defesa

1. Marcar um remate (qualquer dos 4 resultados) — **esperado**: aparece a
   opção de escolher zona (grelha de 12 botões, não um desenho de campo).
2. Escolher uma zona — **esperado**: fica associada ao remate.
3. Marcar outro remate e tocar "saltar" na zona — **esperado**: o remate
   já estava registado antes desse passo; saltar não o desfaz nem atrasa
   o próximo toque.
4. Marcar uma falta sofrida com zona — **esperado**: essa zona representa
   também o livre resultante (não há escolha separada).
5. Marcar uma defesa do guarda-redes com zona — mesmo comportamento.

## Cenário 3 — US3: painel de equipa, sem perder velocidade

1. Mudar a fase de jogo ativa — **esperado**: fica registada como um
   acontecimento (não só um estado que se perde ao mudar de novo).
2. Marcar uma transição — **esperado**: pede direção, resultado, E
   vantagem numérica antes de confirmar; nenhuma opção de atribuir a um
   jogador aparece.
3. Marcar uma recuperação, uma perda, uma bola parada ganha, e uma ação
   defensiva — **esperado**: cada uma tem a opção (não obrigatória) de
   atribuir a um jogador.
4. Marcar o início de goleiro-linha, depois o fim — **esperado**: regista
   como um período; não muda quem está listado em quadra.
5. Marcar uma recuperação, e logo a seguir um remate de um jogador —
   **esperado**: o `tipo` do remate já vem preenchido como "Ataque
   rápido", visível e corrigível, sem pedir escolha manual. Repetir com
   uma transição ganha antes de um remate — **esperado**: `tipo` vem como
   "Transição".

## Cenário 4 — US4: transições desperdiçadas no Resumo

1. Marcar uma transição ofensiva "perdida" com vantagem real (ex. "3x1").
2. Marcar uma transição ofensiva "perdida" com igualdade numérica (ex.
   "1x1").
3. Marcar uma transição ofensiva "ganha" com vantagem real (ex. "2x0").
4. Abrir o Resumo do jogo — **esperado**: só a transição do passo 1
   aparece na lista de transições desperdiçadas; as dos passos 2 e 3 não.

## Regressão

- `npm test --workspace packages/engine` — inclui os testes novos e os já
  existentes (nenhum deve quebrar).
- `npx tsc --noEmit -p apps/web` limpo.
- `npm run build --workspace apps/web` sem erro.
- Um jogo registado inteiramente pela tela ANTIGA ("Jogo ao vivo")
  continua a abrir e funcionar normalmente no Resumo/Timeline/Registo —
  os tipos de evento novos não quebram nada pra um jogo que nunca os usou.
- A tela "Jogo ao vivo" continua a funcionar exatamente como antes —
  nenhuma mudança visível pro treinador.
