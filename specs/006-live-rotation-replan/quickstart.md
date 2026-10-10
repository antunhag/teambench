# Quickstart: validar Replaneamento de rotação durante o jogo

Guia de validação de ponta a ponta. Não é a lista de tarefas (isso é o `tasks.md`,
gerado por `/speckit-tasks`).

## Pré-requisitos

- Nenhuma migração nova a aplicar — esta feature não cria tabela nem coluna.
- Build local a passar: `npm test --workspace packages/engine`,
  `npx tsc --noEmit -p apps/web`.
- **Nunca testar contra o Plantel ou jogos reais do clube** (Princípio IV) — usar o
  jogo de teste já estabelecido (`teste4`) ou outro jogo de teste, nunca um jogo real.
- Um plano de rotação já escolhido pro jogo de teste, com pelo menos um atleta de
  teste escalado em turnos no segundo tempo (pra ter "turnos futuros" de verdade pra
  afetar).
- O jogo de teste precisa estar **ao vivo** (iniciado, não só agendado) pra validar o
  comportamento "ciente do jogo ao vivo" — `Iniciar jogo` → `1ª Parte` em andamento.

## Cenário 1 — User Story 1 (aviso de plano desatualizado)

1. Com o jogo de teste ao vivo e um plano já escolhido, ir no Plantel e marcar um
   atleta de teste que aparece em turnos FUTUROS do plano como "Indisponível".
2. Voltar pra aba "Rotações" do jogo de teste.
3. **Esperado**: um aviso claro aparece, identificando os turnos/vagas futuros
   afetados por esse atleta — nada no plano muda sozinho.
4. Marcar um atleta indisponível que só aparece em turnos JÁ PASSADOS (antes do
   momento atual do jogo).
5. **Esperado**: nenhum aviso aparece (nada no plano futuro foi afetado).

## Cenário 2 — User Story 2 (pedir o replaneamento)

1. Com o aviso do Cenário 1 na tela, acionar o replaneamento ("Gerar opções" — mesmo
   botão do plano pré-jogo).
2. **Esperado**: em menos de 1 minuto (na prática, quase instantâneo), aparecem 3
   opções cobrindo só o tempo restante do jogo — nunca o atleta indisponível em
   nenhuma vaga de nenhuma das 3.
3. Conferir os turnos já jogados (antes do momento atual) nas opções mostradas.
4. **Esperado**: não aparecem nas opções — elas só mostram o intervalo [agora, fim do
   jogo].
5. Escolher uma das 3 opções.
6. **Esperado**: os turnos já jogados continuam exatamente como estavam; só os turnos
   a partir do momento atual em diante mudam pro que foi escolhido.

## Cenário 3 — User Story 3 (confirmação antes de aplicar)

1. Repetir o Cenário 2 até a tela de opções aparecer.
2. **Esperado**: cada opção mostra claramente o que muda (turnos/atletas) em relação
   ao plano atual, antes de qualquer confirmação.
3. Fechar/cancelar sem escolher nenhuma opção.
4. **Esperado**: o plano original continua em vigor, sem nenhuma mudança — a sugestão
   nunca se aplica sozinha.

## Edge cases a conferir

- Pedir o replaneamento faltando pouquíssimo tempo de jogo (ex.: ajustar o relógio do
  jogo de teste pros últimos 2 minutos da parte): o sistema ainda gera uma sugestão
  válida pro tempo que resta, por menor que seja.
- Fazer sobrar menos atletas elegíveis que vagas pro tempo restante (marcar vários
  atletas de teste indisponíveis de uma vez): o sistema mostra isso claramente, nunca
  gera uma escalação com vaga sem ninguém nem falha silenciosamente.
- Editar manualmente um turno futuro do plano (como já é possível hoje) entre o aviso
  e o replaneamento: a sugestão gerada depois parte do estado mais recente (incluindo
  essa edição manual), nunca de uma versão desatualizada.

## Regressão a conferir

- O plano PRÉ-JOGO (jogo ainda não iniciado) continua gerando o jogo inteiro desde o
  minuto 0, exatamente como hoje — `generateRotationOptions` sem `startPoint` não muda
  de comportamento.
- Editar manualmente um turno (trocar atleta, mover fim) continua funcionando
  exatamente como antes, com o jogo ao vivo ou não — esta feature acrescenta um
  caminho de replaneamento automático, não substitui a edição manual.
- O aviso "turno encerra em breve" (`useLiveMatch.ts`, já existente) continua
  funcionando sem alteração.
- `npm test --workspace packages/engine` continua 100% a passar, incluindo os testes
  novos de geração com ponto de início e detecção de turnos afetados.
