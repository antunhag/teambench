import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from solver import Inviavel, resolver
from validar import validar_plano

RAIZ = Path(__file__).parent.parent


def _config_minimo() -> dict:
    # 1 parte curta, 1 atleta por vaga (nenhuma disputa real) — só prova que o modelo monta e
    # resolve corretamente num cenário trivial, rápido o bastante pra rodar em todo CI.
    return {
        "jogo": {"partes": 1, "minutos_por_parte": 6, "partes_iguais": False},
        "posicoes": ["Fixo", "Pivô", "Ala Esquerda", "Ala Direita"],
        "atletas": [
            {"nome": "A", "papel": "principal", "posicoes": ["Fixo"], "alvo_min": 6},
            {"nome": "B", "papel": "principal", "posicoes": ["Pivô"], "alvo_min": 6},
            {"nome": "C", "papel": "principal", "posicoes": ["Ala Esquerda"], "alvo_min": 6},
            {"nome": "D", "papel": "principal", "posicoes": ["Ala Direita"], "alvo_min": 6},
        ],
        "titulares": {"Fixo": "A", "Pivô": "B", "Ala Esquerda": "C", "Ala Direita": "D"},
        "regras": {
            "tolerancia_min_principal": 0,
            "tolerancia_min_apoio": 0,
            "max_minutos_seguidos": 6,
            "min_minutos_por_entrada": 1,
            "min_minutos_pausa": 1,
            "min_minutos_na_posicao": 1,
            "max_apoio_em_campo": 1,
            "fecho_sem_apoio_min": 0,
            "fecho_com_titulares_min": 0,
            "max_diferenca_entre_partes": 99,
            "limites_posicao": [],
        },
        "pesos": {"entrada": 1, "momento_de_troca": 1, "inicio_em_posicao": 1, "minuto_igual_ao_plano_referencia": 0, "minuto_de_titular_no_fecho": 0},
        "solver": {"tempo_limite_s": 30},
    }


def test_resolver_cenario_minimo():
    cfg = _config_minimo()
    plano = resolver(cfg)
    validar_plano(cfg, plano)  # não deve levantar.
    assert set(plano.keys()) == {"1"}
    assert plano["1"]["Fixo"] == [["A", 0, 6]]


def test_resolver_cenario_impossivel_levanta_inviavel():
    cfg = _config_minimo()
    # Pede 10 min de alvo num jogo de 6 min — matematicamente impossível, tolerância 0.
    cfg["atletas"][0]["alvo_min"] = 10
    try:
        resolver(cfg)
        assert False, "esperava Inviavel"
    except Inviavel:
        pass


def test_resolver_config_exemplo_produz_plano_valido():
    """Integração: o config de referência completo (10 atletas, 2x30 min, todas as regras
    da SPEC.md) resolve e passa a validação completa (secção 6)."""
    cfg = json.loads((RAIZ / "config_exemplo.json").read_text(encoding="utf-8"))
    cfg["solver"]["tempo_limite_s"] = 120  # teto mais curto que o default (480s) pra não travar o CI.
    plano = resolver(cfg)
    validar_plano(cfg, plano)  # não deve levantar.
    assert set(plano.keys()) == {"1", "2"}
