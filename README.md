# teambench (nome de trabalho)

SaaS multi-equipa derivado do [Banco Sub-15](https://github.com/antunhag/AAL-NEW) — app de registo de jogo em tempo real para futsal, offline-first.

O `AAL-NEW` continua a rodar como está, sem mudanças, para a Académica de Leça. Este repositório é o produto novo, começando pela extração do motor de jogo (o que já funciona e está bem testado lá) antes de qualquer backend ou interface.

Plano completo de implementação: ver o histórico da conversa / plano aprovado (fases 0–4).

## Estrutura

```
packages/
  engine/   # lógica pura do jogo (relógio, eventos, placar, tabela de resumo) — sem DOM, sem backend
```

## Fase atual: Fase 0 — extração e testes do motor

```bash
npm install
npm test
```

Os testes em `packages/engine/test/` incluem uma regressão permanente para o caso real que motivou a arquitetura atual: dois atletas podem legitimamente usar o mesmo número de camisola, e a identidade de um atleta é sempre o seu `id`, nunca o número.
