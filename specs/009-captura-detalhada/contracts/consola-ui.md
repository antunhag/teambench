# Contrato de UI: Consola (revisto 2026-10-25)

Contrato de interação da Consola, aferido com o protótipo `docs/prototipos/consola-prototipo.html`.
"Toques" contam a partir do ecrã principal sem nada aberto.

## Estrutura (de cima para baixo)

1. **Cabeçalho**: resultado, parte, cronómetro grande (≥ 24 px no iPhone, ≥ 34 px no tablet), faltas da parte, estado de sincronização (pode partir em 2 linhas no iPhone; nunca cortado).
2. **Barra de equipa**
   - Tablet: Transição a favor, Transição contra, Golo sofrido (cada um com "1ª n · total m" e "−" ao lado — "−" na Etapa 2), GR-linha (com duração quando ativo), Pausa/Retomar ou Iniciar parte, Fim da parte. Tablet vertical: 2 filas de 3.
   - iPhone vertical: Trans. a favor, Trans. contra, Golo sofrido (com contadores), "Mais…" (resto + "−" + perdas/recuperações); com GR-linha ativo, o lugar de "Mais…" mostra o GR-linha e "Mais…" passa para a doca.
   - iPhone horizontal: sem barra; "Equipa" na coluna lateral.
3. **Faixa do último evento** (altura fixa): hora, ação, jogador, detalhes; "Desfazer" (só o último; desativado em limites de parte e durante um fluxo); "+ Zona" quando aplicável; no tablet, "Resumo". Mostra "Anulado: …" após um "−".
4. **Linhas dos 5 em quadra** (posição fixa; quem entra herda a linha de quem sai; vaga por vermelho mantém a posição).
5. **Tablet**: coluna lateral com perdas/recuperações por zona (Etapa 2) e banco — o banco tem de ficar visível sem scroll nas medidas de referência.
6. **iPhone vertical**: doca em baixo — Substituir, Resumo, Pausa, ⚙.

## Linha de jogador (densidade B, defeito)

| Linha | Ações visíveis | Expansão / ⋯ |
|---|---|---|
| Jogador de linha | Golo · Remate ▸ · Falta feita · Falta recebida | Remate ▸ → Defendido · Fora · Bloqueado · ✕ (na própria linha, mesma altura); ⋯ → Amarelo, Vermelho, Atendimento, Substituir |
| Guarda-redes | Golo sofrido · Remate deles ▸ · Falta feita · Falta recebida | Remate deles ▸ → Defendido · Fora · Bloqueado · ✕; ⋯ → Saída 1x1 ganha/perdida, cartões, atendimento, substituir |

Densidade A (opção): 8 ações por linha (Golo/Defendido/Fora/Bloqueado · Amarelo/Vermelho · Feita/Recebida; GR: Golo sofrido/Defendido/Fora/Bloqueado).

## Toques (SC-003)

| Ação | Toques |
|---|---|
| Falta feita / recebida | 1 |
| Remate sem golo | 2 |
| Golo sem detalhes | 2 (Golo + Confirmar) |
| Zona | +1, opcional |
| Transição (tablet ou iPhone pela barra) | 2 |
| Perda / recuperação por zona | 1 (tablet) · 2 (iPhone, via "Mais…") |
| "−" numa categoria | 1 (tablet) · 2 (iPhone, via "Mais…" ou Resumo) |

## Zona rápida (Etapa 2; golo já na Etapa 1)

- Painel não modal (sem fundo escurecido); não desloca a lista.
- Grelha de referência: "nossa baliza" à esquerda, "baliza adversária" à direita, "ataque →"; colunas 1-3 | 4-6 ‖ 7-9 | 10-12, cada coluna de cima para baixo; linha tracejada no meio-campo.
- Um toque numa zona grava-a; ✕ ou qualquer outra ação fecha sem custo (a outra ação é registada).
- Envio do evento para a fila só depois de a zona ser escolhida ou o painel fechar (research Decisão 3).

## Transições (Etapa 2)

Toque em "Transição a favor/contra" → folha com "Com finalização" e "Sem finalização", cada uma com os presets de superioridade (`goalTypes.ts`); um toque num preset regista e fecha.

## Substituições e vaga

- Banco → jogador que entra → "SAI" na linha de quem sai (ou ⋯ → Substituir → banco).
- Cancelar (botão, ✕, fundo) termina o fluxo; nenhum toque posterior consome uma intenção antiga.
- Vaga por vermelho: escolher no banco e **confirmar**; aviso "a elegibilidade da reposição não é validada".

## Critérios gerais

Alvos ≥ 48×48 CSS px e o maior possível até 64 px sem esconder jogadores; sem scroll horizontal; sem texto essencial cortado (hifenização em pontos legíveis); sem hover; zoom ativo; safe areas respeitadas; relógio atualiza só o texto (sem re-render da lista).
