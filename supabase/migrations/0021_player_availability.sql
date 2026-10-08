-- Estado do atleta (Apto/A retomar/Indisponível) — conceito novo, pra
-- alimentar a sugestão de rotação baseada em dados (specs/003-data-driven-
-- rotation/). É informação sobre o atleta em si, não sobre um jogo
-- isolado — por isso fica em `players`, gerido no Plantel, não dentro do
-- planeamento de um jogo específico.
--
-- Sem policy de RLS nova: `players_update_coach` (migração 0004) já
-- permite team_admin atualizar qualquer coluna de `players` — as duas
-- colunas novas caem sob essa mesma policy, de propósito (Princípio II da
-- constituição não exige revisão do security-auditor aqui, já que nada
-- muda na RLS em si — ver Constitution Check em
-- specs/003-data-driven-rotation/plan.md).
--
-- "a_retomar" e "indisponivel" têm regras de expiração diferentes, geridas
-- na aplicação, não aqui: "indisponivel" só reverte quando o treinador
-- marca "apto" de novo (lesão longa); "a_retomar" reverte sozinho assim
-- que um plano de rotação que inclui o atleta é guardado (ver Decisão 1 em
-- specs/003-data-driven-rotation/research.md — nenhuma das duas precisa de
-- uma coluna extra de "pra que jogo serve").

alter table players add column availability_status text not null default 'apto'
  check (availability_status in ('apto', 'a_retomar', 'indisponivel'));
alter table players add column availability_note text;
