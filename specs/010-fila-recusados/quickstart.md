# Quickstart: validação da 010

## Automática (sem rede, sem Supabase real)

```bash
npm test
./node_modules/.bin/tsc -p apps/web --noEmit
npm run build --workspace apps/web
```

Os testes em `apps/web/src/sync/` cobrem:

1. Lote recusado com 1 lance mau entre 20 → 19 enviados, 1 recusado (SC-001).
2. Lances de dois jogos, recusa num deles → o outro jogo sincroniza.
3. Sessão expirada ou rede no lote → 0 recusados, fila intacta (SC-003).
4. Recusa geral a meio do envio lance a lance → os aceites saem, o resto fica na fila (não recusado).
5. Recusado aceite numa nova tentativa → sai da lista.
6. Falha de escrita a meio da passagem para recusados → o lance nunca é perdido (SC-002).
7. Textos dos motivos e do aviso ([contrato](./contracts/estado-sincronizacao.md)).

## Manual (utilizador, num jogo de teste)

1. Registar uns lances sem rede e voltar à rede → sincronizam como hoje.
2. Na Registo noutro aparelho, corrigir um lance que este aparelho ainda tem por enviar, e
   depois voltar a dar rede a este aparelho.
   - Deve aparecer: "1 lance não foi aceite pelo servidor: o lance foi corrigido entretanto na
     Registo".
   - Os outros lances sincronizam.
3. "Tentar outra vez" → o aviso mantém-se (a recusa é permanente), sem bloquear nada.
