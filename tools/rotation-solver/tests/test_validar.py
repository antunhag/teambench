import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from relatorio import ocupacao_por_minuto
from validar import ValidacaoFalhou, validar_plano

RAIZ = Path(__file__).parent.parent


def _carregar(nome: str) -> dict:
    return json.loads((RAIZ / nome).read_text(encoding="utf-8"))


def test_cenario1_integridade_basica():
    """rotacao_cenario1.json é um plano mais antigo/manual (ver SPEC.md — 'cenário 1', não o
    config_exemplo.json final); não cumpre as regras de fecho formalizadas depois (ver
    test_validar_plano_rejeita_fecho_errado), mas tem que cumprir o básico estrutural: 4
    atletas distintos em campo o tempo todo, cobertura 0..N sem buracos, ninguém fora da
    posição permitida."""
    cfg = _carregar("config_exemplo.json")
    plano = _carregar("rotacao_cenario1.json")
    posicoes_atleta = {a["nome"]: a["posicoes"] for a in cfg["atletas"]}
    N = cfg["jogo"]["minutos_por_parte"]

    for h_str, plan in plano.items():
        oc = ocupacao_por_minuto(plan, N)
        for t in range(N):
            assert len(oc[t]) == 4, f"parte {h_str} minuto {t}: {len(oc[t])} vagas preenchidas, esperado 4"
            assert len(set(oc[t].values())) == 4, f"parte {h_str} minuto {t}: atleta repetido em 2 vagas — {oc[t]}"
            for vaga, nome in oc[t].items():
                assert vaga in posicoes_atleta[nome], f"'{nome}' escalado em '{vaga}', vaga não permitida pro atleta"
        for vaga, segs in plan.items():
            assert segs[0][1] == 0 and segs[-1][2] == N, f"parte {h_str}, vaga {vaga}: cobertura não vai de 0 a {N}"


def test_validar_plano_rejeita_fecho_errado():
    cfg = _carregar("config_exemplo.json")
    plano = _carregar("rotacao_cenario1.json")
    try:
        validar_plano(cfg, plano)
        assert False, "esperava ValidacaoFalhou (o plano antigo não respeita as regras de fecho atuais)"
    except ValidacaoFalhou as e:
        assert "fecho" in str(e)
