# Data model (010): só no aparelho, nada no servidor

## RecusadoItem (`localStorage`, chave `teambench.outbox.<ownerId>.recusados`)

| Campo | Tipo | Notas |
|---|---|---|
| `item` | `OutboxItem` | exatamente o objeto que estava na fila — nunca recalculado |
| `motivo` | `"alterado" \| "sem_permissao" \| "nao_existe" \| "outro"` | da última recusa |
| `detalhe` | `string` | mensagem técnica da última recusa (para reportar) |
| `tentadoEm` | `number` | `Date.now()` da última tentativa |

**Regras:**
- Sem duplicados por `item.client_event_id`.
- Uma lista ilegível nunca é tratada como vazia nem sobrescrita, pela mesma regra da fila.
- A ordem de inserção mantém-se.

## Estados de um lance

`na fila` → (aceite) → `no servidor`
`na fila` → (recusa do lance) → `recusado` → (aceite numa nova tentativa) → `no servidor`
`na fila` → (recusa geral) → `na fila` (sem alteração)
`recusado` → (recusa geral numa nova tentativa) → `recusado` (sem alteração)

Um lance nunca sai do aparelho sem uma resposta positiva do servidor.

## Estado de sincronização exposto à UI (`OutboxStatus`)

São acrescentados:
- `rejectedCount: number`
- `rejectedReasons: Partial<Record<Motivo, number>>`
- `rejectedCorrupted: boolean`
