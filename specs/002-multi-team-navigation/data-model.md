# Data Model: Navegação Multi-Equipa com Segregação de Acesso

Nenhuma tabela nova no Supabase, nenhuma mudança de forma nas existentes — esta
feature é inteiramente client-side (ver Constitution Check em `plan.md`). As
"entidades" abaixo vivem só em memória/`localStorage` no browser, derivadas de
dados que `team_members`/`teams` já expõem hoje.

## `TeamMembership` (client-side, substitui o `CurrentTeam` singular de hoje)

Uma linha por equipa a que o utilizador autenticado pertence — hoje `useCurrentTeam`
só carrega uma (`.limit(1)`); passa a carregar todas.

| Campo | Tipo | Notas |
|---|---|---|
| `teamId` | `string` (uuid) | Igual ao `teams.id` de hoje. |
| `teamName` | `string` | Igual a `teams.name`. |
| `role` | `"team_admin" \| "data_entry" \| "viewer"` | Igual a `team_members.role` — o papel é por equipa, por isso faz parte de cada `TeamMembership`, não um valor único global. |

**Fonte**: `select role, teams(id, name) from team_members where user_id = <utilizador>`
— mesma query de hoje, só sem `.limit(1).maybeSingle()`.

**Validação**: Nenhuma nova — RLS já garante que só vêm linhas do próprio utilizador.

## `TeamSelection` (client-side, novo conceito)

Qual `TeamMembership` está "ativa" num dado momento, pra toda a navegação e ecrãs.

| Campo | Tipo | Notas |
|---|---|---|
| `selectedTeamId` | `string \| null` | `null` só quando a lista de equipas está vazia (fluxo já existente de "sem equipa"). |

**Persistência**: `localStorage`, por aparelho (Decisão 3 do `research.md`) — chave
dedicada, nunca partilhada com as chaves já usadas por `outbox.ts`/`useLiveMatch.ts`.

**Transições de estado**:
- Lista de equipas carrega pela primeira vez → se houver uma seleção guardada em
  `localStorage` E ela ainda estiver na lista, usa essa; senão, usa a primeira da
  lista (ordem estável, ex.: por nome).
- Utilizador troca manualmente de equipa (FR-003/FR-009) → atualiza
  `selectedTeamId` e grava em `localStorage` de imediato.
- A equipa selecionada deixa de estar na lista (FR-007 — removido, ou perdeu
  acesso) → cai para outra `TeamMembership` da lista, se houver; senão, `null`
  (ecrã "sem equipa").

## `NavItem` (client-side, novo conceito, definido em `packages/engine/src/navigation.ts`)

Cada área/ecrã navegável da app.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `string` | Ex.: `"calendar"`, `"roster"`, `"match-formats"`, `"team-members"`. |
| `label` | `string` | Rótulo em português mostrado na navegação. |
| `group` | `"jogo" \| "gestao"` | Agrupamento visual (Decisão 6 do `research.md`) — não é um nível de navegação à parte. |
| `minRole` | `"viewer" \| "data_entry" \| "team_admin"` | Papel mínimo, NA equipa selecionada, pra este item aparecer. |

**Validação**: Lista estática, definida uma vez no código (não vem do banco) — os
papéis e a ordem já são conhecidos e fixos, não há necessidade de configurar isto
em dados.

**Comportamento**: `visibleNavItems(role: Role): NavItem[]` é uma função pura — dado
o papel do utilizador na equipa selecionada, devolve só os itens cujo `minRole` ele
cumpre. Reavaliada sempre que `TeamSelection` muda (papéis podem ser diferentes em
equipas diferentes — User Story 3, cenário 3).
