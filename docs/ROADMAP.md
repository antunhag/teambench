# Roadmap do Teambench

> Fila de funcionalidades e iniciativas, não uma lista de tarefas do dia a dia.
> Para iniciativas maiores, o próximo passo formal é `/speckit-specify` (ver
> [constituição](../.specify/memory/constitution.md), Princípio III) antes de
> qualquer código — este documento só regista a intenção e a prioridade.
>
> Última revisão: 2026-10-07.

## Agora

- **Navegação multi-equipa com segregação de acesso** — identificado
  2026-10-07, assim que "Robustecer o acesso multiusuário" (abaixo) ficou
  pronto: a partir do momento em que mais gente do clube (não só a equipa
  Sub-15 atual) for usar o Teambench, vai ser preciso navegação própria por
  equipa e a segregação de acesso refletida na estrutura de ecrãs, não só
  nas RLS por trás — hoje está tudo numa tela só. O esquema já comporta isto
  (`clubs` → `teams` → `team_members`, Princípio III da constituição) mas a
  UI ainda não. Ainda não especificado — próximo passo é `/speckit-specify`.
- Verificar domínio de envio no Resend (resend.com/domains) — hoje bloqueia
  qualquer convite de chegar por email pra quem não é o dono da conta
  ([docs/SECURITY.md](SECURITY.md)).
- Endurecer `match_events` contra UPDATE fora do resync idempotente
  (achado da auditoria, adiado por exigir desenho cuidadoso de trigger).
- Resolver a vulnerabilidade crítica em dependências de dev (`vitest`/`vite`)
  — exige upgrade maior, avaliar com calma antes de forçar.

## Feito recentemente

- **Robustecer o acesso multiusuário do clube atual** (2026-10-07) — spec
  completa em [specs/001-multi-user-access/spec.md](../specs/001-multi-user-access/spec.md).
  Entregou: trava "uma conta, um recurso, até libertar" (generalização da
  trava de jogo já existente) estendida a 4 telas (jogo ao vivo, corretor
  pós-jogo, Plantel, Formato de Jogo, Convites — migrações `0016`); histórico
  de acesso (quem entrou/saiu, quando, por quem) e proteção contra uma
  equipa ficar com zero Admins (migração `0017`, 2 rondas de revisão do
  `security-auditor`, achado crítico real + 2 bugs de SQL corrigidos antes
  de aplicar); mudar o papel de alguém diretamente, sem depender de
  reconvidar (migração `0018`, follow-up pedido durante a implementação).
  Detalhe completo em [docs/SECURITY.md](SECURITY.md) e
  [docs/ARCHITECTURE.md](ARCHITECTURE.md).
- Auditoria de segurança completa do resto do repositório — **feita e
  corrigida** em 2026-10-07. Dois achados reais (exposição de convites
  pendentes a não-admins; troca indevida de clube de uma equipa),
  corrigidos e aplicados em produção via
  `supabase/migrations/0015_security_audit_fixes.sql`. Detalhe completo em
  [docs/SECURITY.md](SECURITY.md).

## A seguir

- **Cobertura de testes em `apps/web`** — hoje só `packages/engine` tem testes
  automatizados (Vitest); a interface inteira depende de verificação manual no
  navegador a cada mudança. Pelo menos os fluxos críticos (convite, registo ao
  vivo, corretor pós-jogo) merecem alguma rede de segurança automatizada.
- **Gate antes de produção** — todo push pra `main` vai direto pro ar (sem
  staging, só o próprio build como portão). Não precisa virar um pipeline
  complexo, mas vale avaliar algo leve (ex.: preview deploy, ou checklist manual
  formal) antes de mudanças de maior risco.

## Mais tarde / exploração

- **Módulo de cortes de vídeo** — importar vídeo (ex.: YouTube) + o JSON de
  eventos já exportável (`buildEventsExport`) e gerar clipes/highlights. Decisão
  já tomada: roda local/offline, nunca como serviço online, conectado a este
  repositório só pela exportação de dados — nunca embutido em `apps/web`. Falta
  decidir formato (script vs. app com interface) e então passar por
  `/speckit-specify` antes de começar.
- **Prioridade de uso / desembate na rotação** (R02 do documento de requisitos
  de rotação) — hoje a classificação A/B/C por vaga permite empates (vários
  atletas "A" na mesma vaga); decidir QUEM joga primeiro num empate ainda é
  manual. Adiado explicitamente até o resto da rotação provar que precisa disso.

## Não planeado (de propósito)

- **Multi-tenant / multi-clube** — o esquema (`clubs` → `teams` → `team_members`)
  já comporta isso sem redesenho, e essa dimensão é deliberadamente preservada
  em qualquer tabela nova (constituição, Princípio III). Mas construir o
  onboarding, isolamento de UI e o resto da experiência multi-clube só entra
  quando houver um segundo clube real precisando — não antes.
- **Qualquer coisa comercial** (faturação, planos pagos) — fora de escopo
  enquanto o produto servir só este clube.
