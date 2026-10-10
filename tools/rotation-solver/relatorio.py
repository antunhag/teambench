"""Funções puras de pós-processamento (SPEC.md, secção 5) — derivam segmentos,
momentos de troca, tabela de quartetos e estatísticas por atleta a partir de
um plano já resolvido. Sem nenhuma dependência de Excel, pra poder testar
isoladamente (ver tests/test_relatorio.py).
"""
from __future__ import annotations

# Nunca hardcodar os nomes das vagas aqui — a grafia varia entre fontes de
# dados (SPEC.md/config_exemplo.json usam "Ala esquerda"/"Ala direita"
# minúsculo; o Teambench usa "Ala Esquerda"/"Ala Direita" capitalizado).
# Toda função recebe `ordem_vagas` explicitamente (de `cfg["posicoes"]`).


def ocupacao_por_minuto(plan: dict, N: int) -> list[dict[str, str]]:
    """plan de UMA parte -> lista (por minuto) de {vaga: atleta}."""
    ocupacao = [dict() for _ in range(N)]
    for vaga, segs in plan.items():
        for nome, a, b in segs:
            for t in range(a, b):
                ocupacao[t][vaga] = nome
    return ocupacao


def construir_quartetos(plan: dict, N: int, ordem_vagas: list[str]) -> list[dict]:
    """Uma linha por intervalo entre momentos de troca (secção 5.3)."""
    ocupacao = ocupacao_por_minuto(plan, N)
    momentos = [0] + [t for t in range(1, N) if ocupacao[t] != ocupacao[t - 1]]

    linhas = []
    for i, inicio in enumerate(momentos):
        fim = momentos[i + 1] if i + 1 < len(momentos) else N
        atual = ocupacao[inicio]
        anterior = ocupacao[inicio - 1] if inicio > 0 else {}

        quem_antes = set(anterior.values())
        quem_agora = set(atual.values())
        entram = sorted(quem_agora - quem_antes, key=lambda n: _ordem_vaga(atual, n, ordem_vagas))
        saem = sorted(quem_antes - quem_agora, key=lambda n: _ordem_vaga(anterior, n, ordem_vagas))

        mudam = []
        for nome in sorted(quem_agora & quem_antes):
            vaga_antes = next(v for v, p in anterior.items() if p == nome)
            vaga_agora = next(v for v, p in atual.items() if p == nome)
            if vaga_antes != vaga_agora:
                mudam.append(f"{nome}: {vaga_agora}")

        linhas.append(
            {
                "inicio": inicio,
                "fim": fim,
                "quarteto": {v: atual.get(v) for v in ordem_vagas},
                "entram": entram,
                "saem": saem,
                "mudam_de_posicao": mudam,
                "inicial": inicio == 0,
            }
        )
    return linhas


def _ordem_vaga(ocupacao_minuto: dict[str, str], nome: str, ordem_vagas: list[str]) -> int:
    for i, v in enumerate(ordem_vagas):
        if ocupacao_minuto.get(v) == nome:
            return i
    return len(ordem_vagas)


def blocos_em_campo(plano: dict, nome: str, N: int) -> dict[str, list[tuple[int, int]]]:
    """Por parte, lista de blocos (inicio, fim) em que o atleta esteve em campo
    (somando minutos seguidos em qualquer vaga, mudança de posição sem sair não quebra o bloco)."""
    resultado: dict[str, list[tuple[int, int]]] = {}
    for h, plan in plano.items():
        ocupacao = ocupacao_por_minuto(plan, N)
        em_campo = [t for t in range(N) if nome in ocupacao[t].values()]
        blocos: list[list[int]] = []
        for t in em_campo:
            if blocos and blocos[-1][1] == t:
                blocos[-1][1] = t + 1
            else:
                blocos.append([t, t + 1])
        resultado[h] = [(a, b) for a, b in blocos]
    return resultado


def estatisticas_atleta(plano: dict, nome: str, N: int, minutos_jogo_total: int) -> dict:
    blocos = blocos_em_campo(plano, nome, N)
    todos_blocos = [b for parte in blocos.values() for b in parte]
    total = sum(b - a for a, b in todos_blocos)
    maximo_seguido = max((b - a for a, b in todos_blocos), default=0)

    maior_pausa = None
    for parte_blocos in blocos.values():
        for i in range(1, len(parte_blocos)):
            pausa = parte_blocos[i][0] - parte_blocos[i - 1][1]
            if maior_pausa is None or pausa > maior_pausa:
                maior_pausa = pausa

    return {
        "total": total,
        "banco": minutos_jogo_total - total,
        "maximo_seguido": maximo_seguido,
        "maior_pausa": maior_pausa,
        "n_entradas": len(todos_blocos),
    }


def minutos_por_posicao(plano: dict, nome: str) -> dict[str, int]:
    minutos: dict[str, int] = {}
    for plan in plano.values():
        for vaga, segs in plan.items():
            for n, a, b in segs:
                if n == nome:
                    minutos[vaga] = minutos.get(vaga, 0) + (b - a)
    return minutos
