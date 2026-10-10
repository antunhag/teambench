# Gerador de rotações de futsal (MILP)

Ferramenta **standalone** (Python, roda local, fora do app web) que gera planos de rotação minuto a minuto usando programação linear inteira (ver `SPEC.md`). Não faz parte do `apps/web`/`packages/engine` — é um fluxo separado, pro treinador rodar antes do jogo e exportar um Excel.

## Instalação

```bash
cd tools/rotation-solver
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # preencha SUPABASE_URL/SUPABASE_ANON_KEY (mesmos valores de apps/web/.env.local)
```

## Fluxo

1. **Buscar dados reais do Teambench** (Plantel + calendário — nunca escreve nada de volta):
   ```bash
   python buscar_dados.py
   ```
   Pede login (mesma conta do app), lista as equipas/jogos, e grava um `config.json` de partida em `saida/`. **Revise sempre** `papel`, `alvo_min`, `titulares` e `limites_posicao` antes do próximo passo — são heurísticas, não dados reais (ver o aviso no próprio ficheiro gerado).

2. **Gerar o(s) plano(s)** (um ou mais cenários/configs):
   ```bash
   python gerar.py saida/config_2026-10-10_Adversario.json
   # ou vários cenários de uma vez:
   python gerar.py cenario1.json cenario2.json cenario3.json --relaxar
   ```
   `--relaxar`: se o config ficar inviável (restrições impossíveis de cumprir juntas), relaxa progressivamente (tolerância de minutos → máx. seguidos → fecho com titulares → limites por posição) e reporta o que precisou relaxar, em vez de simplesmente falhar.

3. **Exportar pra Excel**:
   ```bash
   python exportar_excel.py saida/plano.xlsx cenario1.json:saida/cenario1.json cenario2.json:saida/cenario2.json
   ```
   Recalcula automaticamente com LibreOffice (`soffice --headless`) se estiver instalado, pra gravar os valores das fórmulas.

## Testes

```bash
pytest tests/
```

## Armadilhas conhecidas (ver SPEC.md, secção 8)

- PuLP 3/4 mudou a API — usar exatamente `pulp==2.9.0`.
- Sem LibreOffice instalado, o Excel abre normalmente mas as fórmulas só calculam quando você abrir no Excel/LibreOffice de verdade (os valores não ficam pré-gravados).
- `papel`, `alvo_min`, `titulares` e `limites_posicao` no config gerado por `buscar_dados.py` são **pontos de partida heurísticos** — o Teambench hoje não guarda minutos-alvo nem papel principal/apoio nem limites por posição, então a ferramenta estima a partir da aptidão/confiança cadastrada. Sempre revisar antes de gerar.
