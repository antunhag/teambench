# Contrato visual: Consola v2 (2026-11-01)

Substitui o visual da Etapa 1/2c (que se afastou do protótipo e não foi aprovado).
Interação e regras de dados continuam as de [consola-ui.md](./consola-ui.md); aqui só
o visual e a disposição. Maqueta estática: `docs/prototipos/consola-v2-maqueta.html`.
Referência visual: "Registo rápido" do Futsal Plan & Stats (PDF do utilizador).

## Decisões (utilizador, 2026-11-01)

1. Remates e faltas continuam **por jogador** (FR-007).
2. Tema **escuro** só na Consola (o resto da app não muda).
3. Categorias de equipa: **o mosaico é o "+"** (1 toque) com o número grande da parte e o
   total do jogo, e **"−" sempre à vista** ao lado.
4. Alvo principal do desenho: **tablet deitado (1280×626)**; o iPhone adapta-se.

## Cores (significado fixo)

| Cor | Significado |
|---|---|
| Verde | a nosso favor: golo, transição nossa, recuperação |
| Vermelho | contra nós: golo sofrido, transição deles, perda, falta feita |
| Ciano | remate nosso |
| Violeta | remate deles |
| Âmbar | falta recebida, GR-linha |
| Azul | guarda-redes |

## Decisões de 2026-11-01 (2.ª ronda)

5. **Transições: 1 toque já com o tipo.** Um cartão com 4 filas (nossa/deles × com/sem
   finalização); cada fila tem os botões de superioridade mais usados — **3x1 · 2x1 · 3x2 ·
   2x0** (escolha do utilizador, 2026-11-01) — e "…" para os restantes (2 toques nos casos
   raros); contador e "−" por fila. No iPhone: o mosaico abre os mesmos botões (2 toques).
6. **Cartão "Adversário"** no registo rápido: Golo sofrido · Defendido · Fora · Bloqueado
   (mosaico = "+", "−" ao lado). "Defendido" é atribuído automaticamente ao GR em quadra.
   Saem da linha do GR.
7. **Linha do GR**: Saída 1x1 ganha · Saída 1x1 perdida · Falta feita · Falta recebida.
8. **Substituições**: banco sempre à vista em mosaicos grandes (minutos jogados e tempo no
   banco; quem descansou mais destacado). Duas formas, sem confirmação:
   - **uma troca, 2 toques**: atleta do banco → "SAI" no cartão de quem sai;
   - **troca de linha**: tocar 2–4 atletas do banco (ficam numerados 1, 2, 3…), depois "SAI"
     em quem sai pela mesma ordem; cada "SAI" fecha um par. Cancelar limpa a fila inteira.
   (Sugestão do plano de rotação num toque: não, por agora.)

## Tablet deitado

- **Topo (uma faixa)**: placar · relógio grande · faltas da parte (vermelho a partir de 5) ·
  último lance · sincronização · GR-linha · Pausa · Fim da parte · Desfazer · ⚙.
- **Esquerda**: 5 cartões de jogador (nome, posição, minutos, golos, ⋯) com 4 ações de 60 px:
  Golo (verde cheio) · Remate ▸ · Falta feita · Falta recebida; GR: ver decisão 7. Por baixo,
  o banco (decisão 8).
- **Direita (registo rápido)**: Transições (decisão 5) · Adversário (decisão 6) · Bola
  (Perdas e Recuperações × Defesa/Meio/Ataque).

## iPhone vertical

- Topo em 2 linhas: placar · relógio · faltas · Desfazer; último lance por baixo.
- Faixa com 3 mosaicos: Transição a favor · Transição contra · Golo sofrido (com "−").
- Uma fila por jogador: nome à esquerda (tocar no nome = menu ⋯) + 4 ações de 56 px.
- Doca: Banco · Equipa… (adversário, bola, GR-linha, fim de parte) · Resumo · Pausa.

9. iPhone: "Remates deles" ficam em "Equipa…" (2 toques) — aceite (tablet é o principal).

**Maqueta aprovada pelo utilizador em 2026-11-01.** Sem perguntas em aberto.

Nota de implementação: o mosaico "Golo sofrido" abre a mesma folha de confirmação do golo
nosso (tipo e zona opcionais; "Golo sofrido" + "Confirmar" = 2 toques), para não perder os
detalhes que o Resumo e a Timeline já usam.
