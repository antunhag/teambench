# Quickstart: validar Geração automática de plano de rotação completo

Guia de validação de ponta a ponta — como confirmar que cada User Story da spec
funciona de verdade depois de implementada. Não é a lista de tarefas (isso é o
`tasks.md`, gerado por `/speckit-tasks`).

## Pré-requisitos

- Migração `0022_rotation_plan_weights.sql` aplicada — **só depois de revisão do
  `security-auditor`** (Princípio II da constituição, tabela nova + RLS nova).
- Build local a passar: `npm test --workspace packages/engine`,
  `npx tsc --noEmit -p apps/web`.
- **Nunca testar contra o Plantel ou jogos reais do clube** (Princípio IV) — usar
  atletas e um jogo de TESTE já existentes no ambiente.
- Pelo menos 1 jogo de teste com 2+ atletas incluídos no plano, alguns com aptidões
  diferentes cadastradas (A, B, sem classificação) numa mesma vaga.

## Cenário 1 — User Story 1 (ajustar peso por vaga)

1. Abrir o planeador de rotação de um jogo de teste, ir no ajuste de pesos.
2. **Esperado**: cada atleta já aparece com um peso inicial coerente com a aptidão
   cadastrada (A pesa mais que B, que pesa mais que C).
3. Pegar um atleta classificado "A" numa vaga e "B" noutra; aumentar o peso dele na
   vaga onde é "B".
4. **Esperado**: o ajuste é salvo e refletido na tela; a aptidão cadastrada no
   Plantel continua intacta (conferir no Plantel depois).
5. Marcar um atleta de teste como "Indisponível" no Plantel (se ainda não tiver
   nenhum).
6. **Esperado**: esse atleta não aparece como opção de peso em nenhuma vaga.

## Cenário 2 — User Story 2 (gerar 3 opções)

1. Com pesos ajustados (ou aceitando os padrões), acionar a geração.
2. **Esperado**: aparecem 3 opções nomeadas (ex.: "Turnos longos" / "Equilibrada" /
   "Mais rotativa"), cada uma preenchendo todas as vagas em todas as partes, sem
   buracos.
3. Comparar o tempo total de um mesmo atleta entre as 3 opções.
4. **Esperado**: esse tempo é próximo nas 3 (sem diferença grande) — o que muda é o
   número de turnos/substituições de cada uma.
5. Escolher uma das 3 opções.
6. **Esperado**: ela vira o plano salvo do jogo (visível na barra de turnos, igual a
   um plano montado à mão).

## Cenário 3 — User Story 3 (editar o plano escolhido)

1. Com uma opção já escolhida, trocar o atleta de um turno gerado.
2. **Esperado**: a troca salva normalmente, sem diferença de comportamento em
   relação a um turno montado à mão.
3. Remover o último turno de uma vaga do plano gerado.
4. **Esperado**: remove normalmente (mesma regra de sempre: só o último turno da
   vaga).
5. Sair da tela e voltar.
6. **Esperado**: o plano aparece exatamente como ficou depois das edições, não a
   opção original gerada.

## Cenário 4 — User Story 4 (gerar de novo)

1. Com um plano já escolhido (e talvez editado), ajustar algum peso de novo.
2. Acionar a geração mais uma vez.
3. **Esperado**: aparece um aviso explícito de que isso vai substituir o plano
   atual, pedindo confirmação antes de mostrar novas opções.
4. Confirmar.
5. **Esperado**: novas 3 opções aparecem, refletindo os pesos atualizados — o plano
   anterior só é substituído depois de uma opção nova ser escolhida.

## Regressão a conferir

- O planeador de rotação continua a funcionar exatamente como antes pra quem ignora
  a geração — montar/editar um plano inteiramente à mão continua possível, sem
  nenhum passo extra obrigatório.
- A sugestão por vaga de specs/003-data-driven-rotation/ (ordenação do seletor,
  motivo exibido) continua funcionando sem alteração — esta feature acrescenta um
  caminho de geração em massa, não substitui o seletor manual.
- `npm test --workspace packages/engine` continua 100% a passar, incluindo os testes
  novos do motor de pesos/geração.
