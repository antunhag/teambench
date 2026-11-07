# Contrato de UI: estado de sincronização com lances recusados

Os avisos aparecem no ecrã principal (`App.tsx`), no cabeçalho do jogo (`MatchFlow.tsx`) e na
pastilha de sincronização da Consola.

## Textos

| Situação | Texto |
|---|---|
| Por enviar, sem recusados | "N lance(s) por sincronizar" / "A sincronizar…" (como hoje) |
| Recusados (1 motivo) | "N lance(s) não foram aceites pelo servidor: {motivo}. Ficam guardados neste aparelho." + botão **Tentar outra vez** |
| Recusados (vários motivos) | "N lance(s) não foram aceites pelo servidor:" + lista "{n} — {motivo}" + botão |
| Lista de recusados ilegível | "Não foi possível ler a lista de lances recusados deste aparelho. Não limpes os dados da app e contacta o suporte." |

## Motivos (texto)

| Motivo | Texto |
|---|---|
| `alterado` | "o lance foi corrigido entretanto na Registo" |
| `sem_permissao` | "a tua conta já não tem permissão nesta equipa" |
| `nao_existe` | "o jogo ou o atleta já não existe" |
| `outro` | "o servidor recusou o lance (detalhe: {detalhe})" |

## Consola (pastilha no topo)

- Com recusados: "⚠ N recusado(s)", na cor de aviso.
- Tocar na pastilha mostra o texto completo e o botão.
- Sem recusados: igual a hoje.

## Comportamento

- "Tentar outra vez" volta a enviar já a fila e os recusados. Enquanto envia, o botão fica
  desativado e mostra "A tentar…".
- Os avisos nunca escondem nem deslocam a lista de jogadores da Consola (FR-022 da 009).
