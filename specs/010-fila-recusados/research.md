# Research: lances recusados (010)

## Decisão 1: distinguir uma recusa geral de uma recusa do próprio lance

- **Decision**: classificar pelo erro que o supabase-js devolve (`code`, `message`, `status`
  quando existir):
  - **geral**:
    - falha de rede ("Failed to fetch", "Load failed", "NetworkError");
    - sessão (`PGRST301`, `PGRST302`, `PGRST303`, "JWT", status 401);
    - servidor indisponível (status ≥ 500 ou 0, `PGRST000`–`PGRST003`, timeout);
    - erro sem informação.
  - **alterado**: `P0001` com "correcao" ou "match_events: UPDATE" na mensagem (guarda 0026).
  - **sem_permissao**: `42501`, "row-level security", "permission denied".
  - **nao_existe**: `23503` (FK, incluindo a da 0027).
  - **outro**: o resto (`23514`, `22P02`, …), com o detalhe guardado.
- **Rationale**: o erro geral não depende do lance, por isso pôr o lance de lado seria um erro
  (US3). Os restantes dependem do lance concreto.
- **Alternatives considered**: (a) contar recusas consecutivas por lance antes de o pôr de lado.
  Atrasa o desbloqueio e não distingue uma sessão expirada. (b) Tratar todos os lances recusados
  um a um como recusados. Arrisca pôr de lado a fila inteira por uma sessão expirada a meio.

## Decisão 2: quando dividir o lote

- **Decision**: o lote completo vai primeiro, como hoje. Se for recusado por um motivo geral,
  não se divide (resultado "offline"/"error"). Se não for geral, envia-se lance a lance, por
  ordem. A primeira recusa geral pára o ciclo e deixa os restantes na fila.
- **Rationale**: o caso normal não ganha custo extra (FR-010). Quando há um lance mau, uma
  única passagem desbloqueia tudo.

## Decisão 3: onde guardar os recusados

- **Decision**: numa lista nova por conta (`teambench.outbox.<ownerId>.recusados`), com
  `{ item, motivo, detalhe, tentadoEm }`.
- **Ordem da escrita**: escreve-se o recusado primeiro e só depois se remove da fila. Se a
  remoção falhar, o lance fica nos dois sítios. O envio seguinte da fila é idempotente
  (`client_event_id`) e a lista não tem duplicados.
- **Separado da quarentena**: a quarentena significa "fila ilegível, recuperação manual" e nunca
  é enviada sozinha. Os recusados são enviados de novo automaticamente.
- **Alternatives considered**: marcar o item dentro da fila principal. Mudaria a forma do
  `OutboxItem` e o invariante "item nunca recalculado".

## Decisão 4: voltar a tentar os recusados

- **Decision**: os recusados são tentados de novo, lance a lance:
  - quando o controlador arranca (abrir a app ou trocar de conta);
  - a cada 5 minutos;
  - no botão "Tentar outra vez".

  Os aceites saem da lista. Os recusados atualizam `motivo` e `tentadoEm`. Uma recusa geral pára
  o ciclo. Antes de cada nova tentativa, os recusados que entretanto voltaram à fila principal
  (duplicados por uma falha a meio) saem da lista.
- **Rationale**: uma permissão reposta ou um jogo restaurado devem resolver o problema sem
  intervenção (US1, cenário 4). Os 5 minutos evitam martelar o servidor com pedidos que vão
  falhar.

## Decisão 5: o jogo aberto não perde os recusados

- **Decision**: em `useLiveMatch.checkRemote`, `pendentes` passa a incluir os ids dos recusados.
  Se a lista estiver ilegível, `pendentes = null` (mantém todos os locais), como a quarentena.
