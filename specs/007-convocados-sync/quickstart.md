# Quickstart: Robustez da seleção de convocados

Validação manual, sempre contra um jogo de teste (`teste3`/`teste4` ou
equivalente) — nunca um jogo real agendado (Princípio IV).

## Pré-requisitos

- Um jogo de teste ainda não iniciado (status `scheduled`), com um Formato
  de Jogo associado.
- `npm test --workspace packages/engine` passando (cobre a derivação/merge
  por `ts`).

## Cenário 1 — US1: seleção sobrevive a trocar de aparelho/sessão

1. Abrir o jogo de teste, marcar 4-5 convocados e 2-3 titulares em
   `PreMatch.tsx` — sem dar o apito.
2. Simular "trocar de aparelho": limpar `localStorage` (DevTools → Application
   → Local Storage → apagar as chaves `teambench.liveMatch.*` e
   `teambench.outbox`) e recarregar a página.
3. **Esperado**: a mesma seleção de convocados/titulares aparece — não uma
   lista vazia.
4. Repetir desligando a rede (DevTools → Network → Offline) antes de marcar
   mais 1-2 atletas, religar a rede, e confirmar que essas marcações também
   chegam ao Supabase (consultar `match_events` com `type like 'convocado_%'
   or type like 'titular_%'` pra esse `match_id`).

## Cenário 2 — US2: adicionar convocado depois do apito

1. No mesmo jogo de teste, dar o apito (Parte 1).
2. Na tela de Jogo ao vivo, usar "+ Chamar atleta" perto do cabeçalho
   "Banco" pra adicionar um atleta que NÃO estava nos convocados originais.
3. **Esperado**: o atleta aparece no Banco imediatamente; dá pra fazer uma
   substituição trazendo-o pra quadra, sem nenhum passo extra.
4. Confirmar que nenhum evento já registado antes (golos, substituições
   anteriores) mudou — só um novo evento `convocado_add` foi acrescentado.

## Cenário 3 — US3: aviso de poucos convocados

1. Em "Formato de Jogo" (equipa de teste), editar um formato existente e
   definir "Mín. convocados" = 10 (ou criar um novo formato já com esse
   mínimo).
2. Criar/abrir um jogo de teste desse formato, marcar só 7 convocados em
   `PreMatch.tsx`.
3. **Esperado**: aviso visível, não-bloqueante — ainda dá pra avançar pro
   jogo mesmo assim.
4. Marcar mais 3 (total 10) — **esperado**: aviso desaparece.
5. Abrir um jogo de outro formato, sem mínimo configurado — **esperado**:
   nenhum aviso aparece, não importa quantos convocados.

## Cenário 4 — merge concorrente (mesmo utilizador, dois aparelhos)

1. Abrir o mesmo jogo de teste em duas abas (simula dois aparelhos do mesmo
   utilizador — a trava de edição é por utilizador, não por aparelho).
2. Marcar atletas diferentes como convocados em cada aba, sem recarregar.
3. Esperar ~10-15s (intervalo do merge ativo).
4. **Esperado**: as duas abas convergem pra mostrar TODAS as marcações
   feitas nas duas, nenhuma desaparece.

## Regressão

- `npm test --workspace packages/engine` — inclui os testes novos e os já
  existentes (nenhum deve quebrar).
- `npx tsc --noEmit -p apps/web` limpo.
- `npm run build --workspace apps/web` sem erro.
- Um jogo PRÉ-EXISTENTE (já com convocados marcados do jeito antigo, sem
  nenhum evento `convocado_*`) continua a abrir e funcionar — confirmar que
  a ausência desses eventos não quebra nada (lista de convocados fica vazia
  nesse caso, que é o comportamento já aceito hoje pra um jogo começado do
  zero).
