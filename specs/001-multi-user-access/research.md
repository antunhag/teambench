# Research: Acesso Multiusuário Robusto

Nenhum `NEEDS CLARIFICATION` ficou pendente do `plan.md` — as decisões abaixo foram
tomadas com base no código já existente, não em suposição.

## Decisão 1 — Corretor pós-jogo reaproveita `useMatchLock`/`claim_live_match` tal como estão

**Decision**: Nenhuma mudança de banco de dados pra User Story 1. `MatchEventEditor.tsx`
passa a chamar `useMatchLock(matchId)` (de `apps/web/src/match/useMatchLock.ts`), igual
ao que `MatchFlow.tsx:42` já faz pro jogo ao vivo.

**Rationale**: `claim_live_match`/`release_live_match` (migração 0009) já travam por
`match_id`, sem nenhuma condição que exija o jogo estar "ao vivo" — a trava é inerente
ao jogo, não ao estado dele. Confirmado por grep: `useMatchLock` só é importado em
`MatchFlow.tsx`, nunca em `MatchEventEditor.tsx` — o gap é puramente de não estar
ligado na UI, não de faltar infraestrutura.

**Alternatives considered**: Criar uma trava nova específica pro corretor pós-jogo —
rejeitado por duplicar exatamente o que já existe e funciona, violando o Princípio III
(escopo pragmático) sem nenhum ganho.

## Decisão 2 — Trava de Plantel/Formato/Convites: uma tabela genérica, não três cópias

**Decision**: Uma tabela `resource_locks` (chave `team_id` + `resource_type` enum:
`roster`/`match_format`/`invites`) com um par de funções genéricas
`claim_resource_lock(p_team_id, p_resource_type)` /
`release_resource_lock(p_team_id, p_resource_type)`, espelhando a forma de
`claim_live_match`/`release_live_match` (mesmo padrão: checa dono atual + heartbeat
obsoleto, reivindica se livre/obsoleto/já é o dono).

**Rationale**: Copiar a tabela `matches` + duas funções três vezes (uma por tela)
seria repetição direta — o enum `resource_type` resolve isso com uma função só,
reutilizável se amanhã surgir uma quinta tela que precise do mesmo padrão.

**Alternatives considered**: Adicionar colunas `roster_holder_id`/`format_holder_id`/
`invites_holder_id` direto na tabela `teams` (mimetizar `matches.live_holder_id`) —
rejeitado por escalar mal (uma coluna nova por superfície futura) e por misturar
conceitos de equipa com estado efémero de edição.

## Decisão 3 — Heartbeat de 20s, igual ao já existente

**Decision**: `useResourceLock` usa o mesmo intervalo de heartbeat (20s) que
`useMatchLock` já usa.

**Rationale**: Consistência de comportamento — o treinador já vai experimentar esse
tempo de espera no jogo ao vivo; não há razão de domínio pra ser diferente nas outras
telas, e inventar um número novo só adicionaria uma variável sem motivo.

**Alternatives considered**: Nenhuma — não há sinal de que 20s seja um problema hoje.

## Decisão 4 — Histórico de acesso gravado por trigger, não por código da aplicação

**Decision**: `team_access_log` é preenchida por triggers em `team_members`
(`AFTER INSERT`/`AFTER DELETE`), não por uma chamada extra no código de
`useTeamMembers.ts`.

**Rationale**: Se o registo dependesse do cliente chamar mais uma função depois de
remover um membro, um erro de rede entre as duas chamadas deixaria o histórico
incompleto silenciosamente — exatamente o tipo de falha que o Princípio I pede pra
evitar. Um trigger no banco garante que a entrada do histórico é inseparável da
própria mudança em `team_members`.

**Alternatives considered**: Log aplicacional (uma chamada RPC separada no cliente) —
rejeitado pelo motivo acima.

## Decisão 5 — Último Admin protegido por trigger no banco, não só na UI

**Decision**: Mesmo padrão da migração 0015 (`prevent_unauthorized_club_reassignment`)
— um trigger `BEFORE DELETE OR UPDATE on team_members` que conta quantos
`team_admin` restariam na equipa e bloqueia se chegaria a zero.

**Rationale**: Princípio II — uma regra de negócio desta importância (nunca ficar sem
Admin) não pode depender só do botão estar escondido na UI; precisa valer mesmo se
alguém chamar a API diretamente.

**Alternatives considered**: Checagem só no cliente antes de chamar `removeMember` —
rejeitado por não ser uma garantia de verdade (RLS/triggers são a única camada que o
projeto trata como fonte de verdade de autorização, ver `docs/SECURITY.md`).

## Decisão 6 — Granularidade da trava: tela inteira, não por registo

**Decision**: `resource_locks` é por `(team_id, resource_type)` — uma linha cobre a
tela inteira (ex.: Plantel), não um registo individual (ex.: um atleta específico).

**Rationale**: Decisão explícita do utilizador durante a revisão da spec — mais simples
de implementar, de explicar, e de testar do que deteção fina por registo, e o volume
real de utilizadores simultâneos (poucos por equipa) não justifica a granularidade fina.

**Alternatives considered**: Trava por registo individual (ex.: por atleta) — era o
desenho original da spec antes da revisão; descartado por adicionar complexidade sem
benefício real dado o volume de utilizadores.
