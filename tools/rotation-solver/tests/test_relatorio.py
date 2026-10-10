import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from relatorio import construir_quartetos, estatisticas_atleta, ocupacao_por_minuto


def _plan_simples():
    # 10 minutos, 2 vagas só, SEM sobreposição (nenhum atleta em 2 vagas ao mesmo tempo —
    # o solver real nunca produz isso, `on[p,h,t]<=1` garante) — suficiente pra testar a
    # lógica de momentos/entram/saem/mudam.
    return {
        "Fixo": [["Ana", 0, 3], ["Bia", 3, 10]],
        "Pivô": [["Carla", 0, 3], ["Ana", 3, 6], ["Carla", 6, 10]],
    }


def test_ocupacao_por_minuto():
    oc = ocupacao_por_minuto(_plan_simples(), 10)
    assert oc[0] == {"Fixo": "Ana", "Pivô": "Carla"}
    assert oc[4] == {"Fixo": "Bia", "Pivô": "Ana"}
    assert oc[9] == {"Fixo": "Bia", "Pivô": "Carla"}


def test_construir_quartetos_momentos():
    linhas = construir_quartetos(_plan_simples(), 10, ["Fixo", "Pivô"])
    # Momentos de troca: 0 (inicial), 3 (Ana sai do Fixo pro Pivô, Bia entra no Fixo, Carla sai do
    # Pivô), 6 (Ana sai do Pivô, Carla volta).
    assert [l["inicio"] for l in linhas] == [0, 3, 6]
    assert linhas[0]["inicial"] is True
    assert linhas[0]["fim"] == 3


def test_construir_quartetos_entram_saem_mudam():
    linhas = construir_quartetos(_plan_simples(), 10, ["Fixo", "Pivô"])
    # Em t=3: Ana sai do Fixo e passa a ocupar o Pivô (muda de posição, não "entra" nem "sai"
    # de campo); Bia entra de verdade; Carla sai de verdade.
    linha_t3 = next(l for l in linhas if l["inicio"] == 3)
    assert linha_t3["mudam_de_posicao"] == ["Ana: Pivô"]
    assert linha_t3["entram"] == ["Bia"]
    assert linha_t3["saem"] == ["Carla"]

    # Em t=6: Carla volta ao Pivô, Ana sai de campo de vez (não tem segmento depois de t=6).
    linha_t6 = next(l for l in linhas if l["inicio"] == 6)
    assert linha_t6["entram"] == ["Carla"]
    assert linha_t6["saem"] == ["Ana"]
    assert linha_t6["mudam_de_posicao"] == []


def test_estatisticas_atleta_bloco_simples():
    plano = {"1": {"Fixo": [["Dinis", 0, 4], ["Felipe", 4, 10]], "Pivô": [["Cartucho", 0, 10]]}}
    stats = estatisticas_atleta(plano, "Dinis", 10, 10)
    assert stats["total"] == 4
    assert stats["maximo_seguido"] == 4
    assert stats["banco"] == 6
    assert stats["n_entradas"] == 1
    assert stats["maior_pausa"] is None  # só uma entrada, sem pausa pra medir.


def test_estatisticas_atleta_pausa_entre_entradas():
    plano = {"1": {"Fixo": [["Dinis", 0, 4], ["Felipe", 4, 9], ["Dinis", 9, 10]], "Pivô": [["Cartucho", 0, 10]]}}
    stats = estatisticas_atleta(plano, "Dinis", 10, 10)
    assert stats["n_entradas"] == 2
    assert stats["maior_pausa"] == 5  # fora de campo do minuto 4 ao 9.
