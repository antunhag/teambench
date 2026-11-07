<!--
Sync Impact Report
Version change: 1.2.0 → 1.3.0
Rationale: MINOR — portão (1) alargado aos testes de apps/web (o `npm test` da raiz passa
  a correr engine + db-tests + apps/web); portão (2) passa a nomear o comando de typecheck
  sem `npx` (que pode descarregar pacotes) e os três pacotes; lista de subagentes do Fluxo
  de Trabalho atualizada com `ui-designer` (7 em .claude/agents/). Nenhum princípio
  mudou; nenhuma garantia foi afrouxada.
Modified principles: none
Modified sections: Fluxo de Trabalho (lista de subagentes); Portões de Qualidade (1) e (2)
Added sections: none
Removed sections: none
Deferred TODOs: none (o TODO da 1.2.0 — criar packages/db-tests — já está feito)
-->

# Teambench Constitution

## Core Principles

### I. Correção dos dados de jogo acima de tudo (NON-NEGOCIÁVEL)
O Teambench regista jogos de futsal AO VIVO, muitas vezes offline (pavilhão sem rede
fiável), por treinadores que não podem parar o jogo pra lidar com um bug. Nenhuma
mudança pode arriscar perder ou corromper um evento de jogo já registado. Isto
significa: o modelo continua event-sourced (nunca reescreve o passado, só acrescenta
correções); nenhuma operação de escrita no `match_events` pode ser destrutiva sem
confirmação explícita; o fluxo ao vivo tem de continuar funcional sem rede. Edição
concorrente (duas pessoas/aparelhos no mesmo jogo) já aconteceu sem aviso — qualquer
mudança na camada de sincronização tem de assumir que isso é normal, não uma exceção.

### II. Revisão deliberada de autenticação, RLS e acesso à equipa
Já existiu uma política de RLS real que permitia qualquer utilizador autenticado
inserir-se a si próprio em `team_members` de QUALQUER equipa, com qualquer papel
(fechada na migração 0007). Isso não se repete por acidente: toda migração SQL que
toque `auth`, RLS, `team_members`, `invites`, ou qualquer policy de acesso exige
passar pelo subagente `security-auditor` (ou revisão equivalente) antes de ser
aplicada em produção — nunca basta "a migração correu sem erro". Credenciais,
tokens e segredos nunca entram em código versionado.

### III. Escopo pragmático, hoje mono-clube — mas sem fechar portas baratas de manter abertas
O Teambench serve HOJE um único clube real, sem faturação, sem multi-tenant — isso é
uma escolha deliberada e temporária, não um compromisso arquitetural permanente. Não
se constrói onboarding de clube novo, isolamento de dados entre clubes, nem UI/infra
multi-tenant enquanto não houver um segundo clube real precisando disso (YAGNI vale
pra funcionalidade, não pra modelo de dados). Mas o esquema já existente
(`clubs`/`teams`/`team_members`, com RLS por equipa) não deve ser achatado em atalhos
de clube único: nenhuma tabela nova assume que só existe uma equipa, nenhum código
hardcoda o id deste clube específico, e toda policy de RLS continua a ser escrita por
`team_id`/`club_id`, nunca "porque só há uma equipa mesmo". Manter essa dimensão já
presente custa pouco agora; achatá-la e ter de reintroduzi-la depois custaria muito
mais. Toda proposta de arquitetura maior (ex.: o módulo de cortes de vídeo) passa
primeiro pelo `/speckit-specify` + `/speckit-plan`, nunca é implementada ad-hoc direto.

### IV. Testes nunca tocam dados reais de produção
Já aconteceu dados de aptidão de jogadores reais ficarem corrompidos por automação de
testes a correr contra o Supabase de produção sem querer. A regra não-negociável é a
propriedade de fundo, não o nome da ferramenta: testes automatizados NUNCA tocam rede
e NUNCA se conectam a um projeto Supabase real (produção ou qualquer outro, local ou
remoto). `packages/engine/test/` (Vitest, TypeScript puro, zero dependências, zero
rede) continua sendo o lar padrão dos testes de lógica de domínio. Testar SQL de
migração/trigger (ex.: RLS, guards de integridade) contra um Postgres totalmente
local e embutido (ex.: PGlite — sem Docker, sem servidor, sem socket de rede nenhum)
é permitido num pacote dedicado separado, desde que esse Postgres nunca se conecte a
nenhum projeto Supabase real. Qualquer verificação manual no navegador contra dados
reais (ex.: conferir uma correção na Timeline) é só LEITURA ou usa um registo de
teste claramente marcado como tal (ex.: email `*.debug.test@example.com`, jogo
"teste"), nunca escreve em cima de um jogo ou atleta real sem confirmação explícita
do treinador.

### V. Simplicidade pra quem não é técnico
Quem usa o Teambench de verdade é o treinador em quadra, não um programador. Toda
tela, mensagem de erro e fluxo tem de fazer sentido em português, sem jargão
técnico, mesmo quando algo falha (ex.: "convite não chegou" tem de virar uma
mensagem compreensível, não um stack trace). Uma funcionalidade que exige
treino/explicação pra um treinador usar sozinho está mal desenhada.

### VI. Documentação viva do sistema
Arquitetura, modelo de segurança/RLS e outros tópicos operacionais importantes vivem
em `docs/` (`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, e outros que surgirem),
descrevendo como o sistema FUNCIONA DE VERDADE hoje — nunca aspiracional, nunca
desatualizada. Essa documentação é distinta desta constituição: aqui ficam os
princípios e as regras; em `docs/` fica o retrato do sistema real. Uma mudança que
altera a arquitetura ou o modelo de segurança/RLS só está concluída quando o
documento correspondente também foi atualizado — mesmo padrão já exigido de testes,
typecheck e build (ver Portões de Qualidade Antes de Publicar).

## Fluxo de Trabalho (Solo + IA)

O Teambench é mantido por uma pessoa, trabalhando em conversa direta com Claude
Code — não há equipa, não há aprovação de PR por terceiros. Isso é uma restrição
permanente a desenhar em torno de, não um problema a resolver contratando gente.
Mudanças de risco maior (RLS, migrações, decisões de arquitetura) compensam esse
não-processo usando os subagentes especializados já configurados em `.claude/agents/`
(`code-reviewer`, `security-auditor`, `architect-reviewer`, `qa-expert`,
`test-automator`, `ui-designer`, `ui-ux-tester`) como o "segundo par de olhos" que um processo de
equipa normalmente daria — invocados explicitamente antes de mudanças sensíveis,
nunca presumidos como automáticos.

## Portões de Qualidade Antes de Publicar

Todo `git push` para `main` vai DIRETO para produção (GitHub Pages, sem staging,
sem gate de CI além do próprio build) — é imediatamente visível pro clube real.
Por isso, antes de qualquer push: (1) `npm test` na raiz tem de passar — corre o
motor (`packages/engine`), o pacote de teste de SQL/migrações (`packages/db-tests`,
ver Princípio IV) e os testes de lógica de `apps/web`; (2) o typecheck
(`./node_modules/.bin/tsc -p <pacote> --noEmit`, nunca via `npx`, que pode
descarregar pacotes) tem de estar limpo em cada pacote afetado (`packages/engine`,
`packages/db-tests`, `apps/web`); (3) `npm run build --workspace apps/web` tem de
compilar sem erro; (4) qualquer mudança visível na UI é conferida no navegador
contra o fluxo real antes de ser dada como pronta — nunca só "o código parece
certo"; (5) se a mudança alterou arquitetura ou o modelo de segurança/RLS,
`docs/ARCHITECTURE.md` e/ou `docs/SECURITY.md` (ver Princípio VI) foram
atualizados antes do push, não depois.

## Governance

Esta constituição tem precedência sobre convenções não-escritas e sobre qualquer
instrução pontual que a contradiga sem justificação explícita. Emendas são feitas
via `/speckit-constitution`, descrevendo a mudança e a razão — nunca editando o
ficheiro à mão sem passar pelo relatório de impacto. Versionamento semântico:
MAJOR = remoção ou redefinição incompatível de um princípio; MINOR = princípio ou
secção nova; PATCH = clarificação sem mudança de regra. Qualquer mudança de maior
risco (RLS, migração, arquitetura) é verificada contra os Princípios II e III, e
documentada conforme o Princípio VI, antes de ser aplicada em produção — na
ausência de revisão de equipa, essa verificação é feita explicitamente invocando o
subagente relevante, não assumida.

**Version**: 1.3.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-11-07
