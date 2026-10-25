# Protótipos

## `consola-prototipo.html` — consola de registo ao vivo (linha por jogador)

Protótipo de interação para a futura segunda tela de jogo ao vivo (ver
`specs/009-captura-detalhada/`). **Não faz parte da app** e não é usado em jogo.

- Um único HTML autocontido: dados fictícios, estado só em memória, sem rede, sem Supabase.
- Abrir no próprio navegador do aparelho. No iPhone/Android, um ficheiro local pode abrir numa
  pré-visualização sem JavaScript; servir a pasta pela rede local, por exemplo
  `python3 -m http.server 8000` no computador e abrir `http://IP-do-computador:8000/consola-prototipo.html`.
- ⚙ → "Avaliação do piloto" (tarefas A/B, contador de ativações, histórico, reiniciar) e
  "Sobre este protótipo" (limitações e notas técnicas).

Decisões do piloto já refletidas no protótipo (a levar para a spec 009):

- Ação tocada na linha do jogador; sem seleção global; sem bloqueio após substituição.
- Densidade B por defeito; botões "o maior que cabe" (64 → 48 px) sem esconder jogadores.
- Zona opcional em todas as ações dos jogadores e remates deles, com a grelha de referência do
  clube: quadra inteira deitada, nossa baliza à esquerda, colunas 1-3 | 4-6 ‖ 7-9 | 10-12.
- Barra de equipa em cima; transições a favor/contra em 2 toques (com/sem finalização +
  superioridade); remates deles na linha do GR; perdas/recuperações por zona (defesa,
  meio-campo, ataque); "−" por categoria; totais "1ª · total"; GR-linha com duração; Resumo rápido.
- Retirados: fase de jogo; perda/recuperação por jogador.

Medidas de referência do tablet do piloto (Samsung Galaxy Tab A11+, Chrome): 800×1106 CSS px
em vertical e 1280×626 em horizontal. Verificações feitas por emulação no Chromium —
não substituem o teste nos aparelhos reais.
