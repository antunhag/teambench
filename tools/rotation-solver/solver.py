"""Motor MILP (programação linear inteira) do gerador de rotações — ver
SPEC.md, secção 4. Adaptado de solver_referencia.py pra uma função
importável/reutilizável por gerar.py, em vez de um script standalone.

Requer: pip install "pulp==2.9.0" highspy (PuLP 3/4 mudou a API — usar 2.9).
"""
from __future__ import annotations

import copy

import pulp


class Inviavel(RuntimeError):
    """Levantado quando o solver não encontra nenhuma solução que respeite as restrições."""


def resolver(cfg: dict) -> dict:
    """Resolve um config (um cenário) e devolve o plano no formato
    {"1": {"Fixo": [[atleta, inicio, fim], ...], ...}, "2": {...}}.
    Levanta Inviavel se não existir solução (ver secção 4.4 da SPEC.md —
    quem chama decide se tenta relaxar, ver `resolver_com_relaxamento`).
    """
    POS = cfg["posicoes"]
    N = cfg["jogo"]["minutos_por_parte"]
    H = list(range(1, cfg["jogo"]["partes"] + 1))
    T = range(N)
    A = {a["nome"]: a for a in cfg["atletas"]}
    EL = {n: a["posicoes"] for n, a in A.items()}
    APOIO = [n for n, a in A.items() if a["papel"] == "apoio"]
    R = cfg["regras"]
    W = cfg["pesos"]
    START = cfg["titulares"]

    ref = set()
    if cfg.get("_plano_referencia"):
        for h, plan in cfg["_plano_referencia"].items():
            for q, segs in plan.items():
                for n, a, b in segs:
                    for t in range(a, b):
                        ref.add((n, q, int(h), t))

    m = pulp.LpProblem("rotacao", pulp.LpMinimize)
    idx = {n: i for i, n in enumerate(A)}
    x = {
        (p, q, h, t): pulp.LpVariable(f"x_{idx[p]}_{POS.index(q)}_{h}_{t}", cat="Binary")
        for p in A
        for q in EL[p]
        for h in H
        for t in T
    }
    X = lambda p, q, h, t: x.get((p, q, h, t), 0)
    on = {(p, h, t): pulp.lpSum(X(p, q, h, t) for q in POS) for p in A for h in H for t in T}
    ent = {(p, h, t): pulp.LpVariable(f"e_{idx[p]}_{h}_{t}", cat="Binary") for p in A for h in H for t in T}
    sai = {(p, h, t): pulp.LpVariable(f"l_{idx[p]}_{h}_{t}", cat="Binary") for p in A for h in H for t in range(1, N)}
    ini = {k: pulp.LpVariable(f"s_{idx[k[0]]}_{POS.index(k[1])}_{k[2]}_{k[3]}", cat="Binary") for k in x}
    mom = {(h, t): pulp.LpVariable(f"m_{h}_{t}", cat="Binary") for h in H for t in range(1, N)}

    for h in H:
        for t in T:
            for q in POS:
                m += pulp.lpSum(X(p, q, h, t) for p in A) == 1
            for p in A:
                m += on[p, h, t] <= 1
            m += pulp.lpSum(on[p, h, t] for p in APOIO) <= R["max_apoio_em_campo"]
        for q, p in START.items():
            if p:
                m += X(p, q, h, 0) == 1
        for t in range(N - R["fecho_sem_apoio_min"], N):
            for p in APOIO:
                m += on[p, h, t] == 0
        for t in range(N - R["fecho_com_titulares_min"], N):
            for q, p in START.items():
                if p:
                    m += X(p, q, h, t) == 1
        for p in A:
            mn, rest, mx = R["min_minutos_por_entrada"], R["min_minutos_pausa"], R["max_minutos_seguidos"]
            m += ent[p, h, 0] == on[p, h, 0]
            for k in range(1, mn):
                m += on[p, h, k] >= ent[p, h, 0]
            for t in range(1, N):
                m += ent[p, h, t] >= on[p, h, t] - on[p, h, t - 1]
                m += sai[p, h, t] >= on[p, h, t - 1] - on[p, h, t]
                for k in range(1, mn):
                    if t + k < N:
                        m += on[p, h, t + k] >= ent[p, h, t]
                for k in range(1, rest):
                    if t + k < N:
                        m += on[p, h, t + k] <= 1 - sai[p, h, t]
            for t in range(0, N - mx):
                m += pulp.lpSum(on[p, h, t + k] for k in range(mx + 1)) <= mx
            mp = R["min_minutos_na_posicao"]
            for q in EL[p]:
                m += ini[p, q, h, 0] == X(p, q, h, 0)
                for k in range(1, mp):
                    m += X(p, q, h, k) >= ini[p, q, h, 0]
                for t in range(1, N):
                    m += ini[p, q, h, t] >= X(p, q, h, t) - X(p, q, h, t - 1)
                    m += mom[h, t] >= ini[p, q, h, t]
                    for k in range(1, mp):
                        if t + k < N:
                            m += X(p, q, h, t + k) >= ini[p, q, h, t]

    for lim in R.get("limites_posicao", []):
        p, q = lim["atleta"], lim["posicao"]
        for h in H:
            s = pulp.lpSum(X(p, q, h, t) for t in T)
            if "max_por_parte" in lim:
                m += s <= lim["max_por_parte"]
            if "min_por_parte" in lim:
                m += s >= lim["min_por_parte"]
        s = pulp.lpSum(X(p, q, h, t) for h in H for t in T)
        if "min_jogo" in lim:
            m += s >= lim["min_jogo"]
        if "max_jogo" in lim:
            m += s <= lim["max_jogo"]

    tot = {p: pulp.lpSum(on[p, h, t] for h in H for t in T) for p in A}
    for p in A:
        d = R["tolerancia_min_apoio"] if p in APOIO else R["tolerancia_min_principal"]
        m += tot[p] >= A[p]["alvo_min"] - d
        m += tot[p] <= A[p]["alvo_min"] + d
        if len(H) == 2:
            a_ = pulp.lpSum(on[p, 1, t] for t in T)
            b_ = pulp.lpSum(on[p, 2, t] for t in T)
            m += a_ - b_ <= R["max_diferenca_entre_partes"]
            m += b_ - a_ <= R["max_diferenca_entre_partes"]
    if cfg["jogo"].get("partes_iguais") and len(H) == 2:
        for (p, q, h, t), v in x.items():
            if h == 2:
                m += v == x[(p, q, 1, t)]

    fecho = pulp.lpSum(X(p, q, h, t) for q, p in START.items() if p for h in H for t in range(N - R["fecho_sem_apoio_min"], N))
    igual = pulp.lpSum(x[k] for k in x if k in ref)
    m += (
        W["entrada"] * pulp.lpSum(ent.values())
        + W["momento_de_troca"] * pulp.lpSum(mom.values())
        + W["inicio_em_posicao"] * pulp.lpSum(ini.values())
        + W["minuto_igual_ao_plano_referencia"] * igual
        + W["minuto_de_titular_no_fecho"] * fecho
    )

    status = m.solve(pulp.HiGHS(msg=False, timeLimit=cfg.get("solver", {}).get("tempo_limite_s", 480)))
    status_nome = pulp.LpStatus[status]
    if status_nome not in ("Optimal",):
        raise Inviavel(f"Solver não encontrou solução válida (status: {status_nome}).")

    res: dict = {}
    for h in H:
        plan: dict = {}
        for q in POS:
            segs: list = []
            for t in T:
                p = next(p for p in A if q in EL[p] and pulp.value(X(p, q, h, t)) > 0.5)
                if segs and segs[-1][0] == p:
                    segs[-1][2] = t + 1
                else:
                    segs.append([p, t, t + 1])
            plan[q] = segs
        res[str(h)] = plan
    return res


# Ordem de relaxamento quando o solver fica inviável — secção 4.4 da SPEC.md.
# Cada passo é (descrição, função que recebe o cfg e devolve uma CÓPIA relaxada,
# ou None se não há mais o que relaxar nesse passo).
def _relaxar_tolerancias(cfg: dict) -> dict | None:
    r = cfg["regras"]
    if r["tolerancia_min_principal"] >= 10 and r["tolerancia_min_apoio"] >= 4:
        return None
    novo = copy.deepcopy(cfg)
    novo["regras"]["tolerancia_min_principal"] = r["tolerancia_min_principal"] + 2
    novo["regras"]["tolerancia_min_apoio"] = r["tolerancia_min_apoio"] + 1
    return novo


def _relaxar_max_seguidos(cfg: dict) -> dict | None:
    r = cfg["regras"]
    if r["max_minutos_seguidos"] >= 15:
        return None
    novo = copy.deepcopy(cfg)
    novo["regras"]["max_minutos_seguidos"] = r["max_minutos_seguidos"] + 2
    return novo


def _relaxar_fecho_titulares(cfg: dict) -> dict | None:
    r = cfg["regras"]
    if r["fecho_com_titulares_min"] <= 0:
        return None
    novo = copy.deepcopy(cfg)
    novo["regras"]["fecho_com_titulares_min"] = max(0, r["fecho_com_titulares_min"] - 1)
    return novo


def _relaxar_limites_posicao(cfg: dict) -> dict | None:
    if not cfg["regras"].get("limites_posicao"):
        return None
    novo = copy.deepcopy(cfg)
    removido = novo["regras"]["limites_posicao"].pop(0)
    novo["_ultimo_limite_removido"] = removido
    return novo


_PASSOS_RELAXAMENTO = [
    ("tolerância de minutos", _relaxar_tolerancias),
    ("máximo de minutos seguidos", _relaxar_max_seguidos),
    ("fecho com titulares", _relaxar_fecho_titulares),
    ("um limite por posição (limites_posicao)", _relaxar_limites_posicao),
]


def resolver_com_relaxamento(cfg: dict, permitir_relaxamento: bool = False) -> tuple[dict, list[str]]:
    """Tenta resolver com o config tal como está; se ficar inviável e
    `permitir_relaxamento` for True, relaxa progressivamente (secção 4.4) e
    tenta de novo, devolvendo também a lista de passos relaxados (vazia se
    nenhum foi necessário) pra reportar claramente ao treinador — nunca
    altera o ficheiro de config original no disco.
    """
    atual = cfg
    relaxados: list[str] = []
    try:
        return resolver(atual), relaxados
    except Inviavel:
        if not permitir_relaxamento:
            raise
    for descricao, passo in _PASSOS_RELAXAMENTO:
        candidato = passo(atual)
        if candidato is None:
            continue
        atual = candidato
        relaxados.append(descricao)
        try:
            return resolver(atual), relaxados
        except Inviavel:
            continue
    raise Inviavel("Mesmo relaxando tolerâncias, máximo seguido, fecho com titulares e limites por posição, não há solução. Revise o config manualmente (ex.: alvo_min inconsistente com a capacidade do jogo).")
