"""Validação automática do plano gerado — SPEC.md, secção 6. Falha (levanta
ValidacaoFalhou) se qualquer regra obrigatória não for cumprida, pra nunca
exportar um Excel com um plano quebrado sem o treinador saber.
"""
from __future__ import annotations


class ValidacaoFalhou(RuntimeError):
    pass


def validar_plano(cfg: dict, plano: dict) -> None:
    erros: list[str] = []
    POS = cfg["posicoes"]
    N = cfg["jogo"]["minutos_por_parte"]
    A = {a["nome"]: a for a in cfg["atletas"]}
    EL = {n: a["posicoes"] for n, a in A.items()}
    APOIO = {n for n, a in A.items() if a["papel"] == "apoio"}
    R = cfg["regras"]

    minutos_por_atleta: dict[str, int] = {n: 0 for n in A}
    ocupado: dict[tuple[str, int], set[str]] = {}  # (parte, minuto) -> {atletas em campo}

    for h_str, plan in plano.items():
        h = int(h_str)
        # 4 atletas distintos em campo em todo minuto, cobertura 0..N sem buracos.
        for q in POS:
            segs = plan.get(q, [])
            if not segs:
                erros.append(f"Parte {h}, vaga {q}: sem nenhum segmento.")
                continue
            if segs[0][1] != 0:
                erros.append(f"Parte {h}, vaga {q}: cobertura começa em {segs[0][1]}, não em 0.")
            if segs[-1][2] != N:
                erros.append(f"Parte {h}, vaga {q}: cobertura termina em {segs[-1][2]}, não em {N}.")
            for i in range(1, len(segs)):
                if segs[i][1] != segs[i - 1][2]:
                    erros.append(f"Parte {h}, vaga {q}: buraco/sobreposição entre {segs[i-1]} e {segs[i]}.")
            for nome, a, b in segs:
                if nome not in A:
                    erros.append(f"Parte {h}, vaga {q}: atleta '{nome}' não está no config.")
                    continue
                if q not in EL[nome]:
                    erros.append(f"Parte {h}, vaga {q}: '{nome}' não tem essa vaga como permitida.")
                minutos_por_atleta[nome] += b - a
                for t in range(a, b):
                    ocupado.setdefault((h, t), set()).add(nome)

        for (hh, t), nomes in ocupado.items():
            if hh != h:
                continue
            if len(nomes) != 4:
                erros.append(f"Parte {h}, minuto {t}: {len(nomes)} atletas em campo (esperado 4) — {sorted(nomes)}.")
            n_apoio = len(nomes & APOIO)
            if n_apoio > R["max_apoio_em_campo"]:
                erros.append(f"Parte {h}, minuto {t}: {n_apoio} atletas de apoio em campo (máx {R['max_apoio_em_campo']}).")

        # Máx. seguidos / pausa mínima / entrada mínima, por atleta, dentro da parte.
        for nome in A:
            em_campo = [t for t in range(N) if nome in ocupado.get((h, t), set())]
            blocos: list[tuple[int, int]] = []
            for t in em_campo:
                if blocos and blocos[-1][1] == t:
                    blocos[-1] = (blocos[-1][0], t + 1)
                else:
                    blocos.append((t, t + 1))
            for inicio, fim in blocos:
                dur = fim - inicio
                if dur > R["max_minutos_seguidos"]:
                    erros.append(f"Parte {h}: '{nome}' ficou {dur} min seguidos em campo (máx {R['max_minutos_seguidos']}).")
                if dur < R["min_minutos_por_entrada"] and not (inicio == 0 or fim == N):
                    # entrada no meio da parte mais curta que o mínimo (entradas que tocam a borda
                    # do jogo/fecho podem ser legitimamente mais curtas por causa de outras regras).
                    erros.append(f"Parte {h}: '{nome}' teve uma entrada de só {dur} min (mín {R['min_minutos_por_entrada']}).")
            for i in range(1, len(blocos)):
                pausa = blocos[i][0] - blocos[i - 1][1]
                if pausa < R["min_minutos_pausa"]:
                    erros.append(f"Parte {h}: '{nome}' teve só {pausa} min de pausa entre entradas (mín {R['min_minutos_pausa']}).")

        # Fecho.
        for t in range(N - R["fecho_sem_apoio_min"], N):
            apoio_em_campo = ocupado.get((h, t), set()) & APOIO
            if apoio_em_campo:
                erros.append(f"Parte {h}, minuto {t} (fecho): atleta(s) de apoio em campo — {sorted(apoio_em_campo)}.")
        for q, titular in cfg["titulares"].items():
            if not titular:
                continue
            for t in range(N - R["fecho_com_titulares_min"], N):
                segs = plan.get(q, [])
                quem = next((nome for nome, a, b in segs if a <= t < b), None)
                if quem != titular:
                    erros.append(f"Parte {h}, minuto {t} (fecho): vaga {q} tem '{quem}', esperado titular '{titular}'.")

    # Totais: soma = 4 x minutos do jogo; cada atleta dentro da tolerância do alvo.
    capacidade_total = cfg["jogo"]["partes"] * N * 4
    soma = sum(minutos_por_atleta.values())
    if soma != capacidade_total:
        erros.append(f"Soma de minutos de todos os atletas é {soma}, esperado {capacidade_total}.")
    for nome, atleta in A.items():
        tol = R["tolerancia_min_apoio"] if nome in APOIO else R["tolerancia_min_principal"]
        alvo = atleta["alvo_min"]
        real = minutos_por_atleta.get(nome, 0)
        if not (alvo - tol <= real <= alvo + tol):
            erros.append(f"'{nome}': {real} min no jogo, fora da tolerância de {alvo}±{tol}.")

    if erros:
        raise ValidacaoFalhou("Plano inválido:\n  - " + "\n  - ".join(erros))
