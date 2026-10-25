# Quickstart: validação da Consola (revisto 2026-10-25)

Validação por etapa. Os testes automáticos nunca usam rede nem um Supabase real (Princípio IV).
A verificação num jogo de teste real é **manual e feita pelo utilizador** (CLAUDE.md), no
iPhone e no tablet. Detalhes de interação: [contracts/consola-ui.md](./contracts/consola-ui.md);
tipos e campos: [data-model.md](./data-model.md).

## Pré-requisitos (no computador do programador)

```bash
npm ci
npm test                                            # engine + db-tests (+ apps/web quando aplicável)
./node_modules/.bin/tsc -p packages/engine --noEmit
./node_modules/.bin/tsc -p packages/db-tests --noEmit
./node_modules/.bin/tsc -p apps/web --noEmit
npm run build --workspace apps/web
```

Todos têm de passar antes de pedir a verificação no aparelho. Cada comando só corre com
autorização (CLAUDE.md — "comando existente ≠ comando aprovado").

## Etapa 1 — Consola com eventos existentes

Num jogo de teste, com a aba **Consola** (iPhone vertical e tablet nas duas orientações):

1. Escolher titulares, dar o apito: o relógio corre como no "Jogo ao vivo".
2. Golo de um jogador com zona (folha do golo, grelha de referência) e golo sofrido pela barra de equipa; placar correto.
3. Falta feita e recebida (1 toque cada); 5ª falta mostra o aviso habitual.
4. Cartão amarelo e vermelho pelo ⋯ (densidade B); o vermelho deixa a linha **vaga** na mesma posição; reposição só com escolha + confirmação.
5. Substituição pelo banco ("SAI" na linha) e pelo ⋯ do jogador; cancelar a meio e tocar no banco → começa fluxo novo, nada é consumido.
6. Pausa (pedido de tempo e outro motivo), fim de parte (relógio para), início da 2ª parte só com o botão.
7. Contadores "1ª · total" e Resumo rápido com os tipos existentes.
8. Abrir o Resumo do jogo e a Timeline: idênticos ao que o "Jogo ao vivo" produziria (SC-002).
9. Layout: 5 jogadores visíveis sem scroll (densidade B), botões ≥ 48 px, sem scroll horizontal, sem texto cortado (SC-005).

## Etapa 2 — Novos tipos de evento

1. Remate do jogador (Remate ▸ → Defendido/Fora/Bloqueado): 2 toques; zona rápida aparece; ignorar e tocar noutra ação regista ambas sem toque extra.
2. Remates deles na linha do GR: Defendido (atribuído ao GR), Fora, Bloqueado (sem jogador).
3. Zona em falta e cartão; fechar a app com o painel de zona aberto e reabrir → o evento está lá e sincroniza uma única vez.
4. Transição a favor 3x1 sem finalização e contra 2x2 com finalização (2 toques cada); aparecem nos contadores, no Resumo e na lista de transições desperdiçadas (só a primeira).
5. Perdas/recuperações por zona (1 toque); "−" numa categoria anula só o último dessa categoria e mostra o aviso; "Desfazer" repõe.
6. GR-linha: estado e duração visíveis; terminar regista a duração.
7. Editor de registo e Timeline mostram os novos tipos e as anulações; placar correto após "−" num golo sofrido.
8. Offline: registar vários lances sem rede; ao voltar a rede, todos sincronizam (sem itens presos na fila).
