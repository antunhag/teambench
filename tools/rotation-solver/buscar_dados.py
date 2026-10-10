"""Busca dados reais do Teambench (Supabase) e monta um config.json de partida
pro solver (ver SPEC.md). Nunca escreve nada de volta no Supabase — só lê.

Uso:
    python buscar_dados.py                    # interativo: escolhe equipa e jogo
    python buscar_dados.py --match-id <uuid>   # direto, sem prompts de seleção
    python buscar_dados.py --out config_jogo.json

Precisa de .env (copie .env.example) com SUPABASE_URL/SUPABASE_ANON_KEY — as
mesmas credenciais do app web (apps/web/.env.local) — e autentica com a MESMA
conta/senha que você já usa no Teambench (RLS aplica normalmente: só vê as
equipas de que já é membro).

O que isto NÃO faz (fica por sua conta, editando o config.json gerado,
exatamente como a SPEC.md pede): "papel" (principal/apoio), "alvo_min",
"titulares", "limites_posicao", "regras" e "pesos" são todos preenchidos com
valores de PARTIDA (heurísticos ou copiados do exemplo de referência) — não
são uma leitura de dado real, porque esse dado não existe no Teambench hoje.
Revise sempre antes de rodar o solver.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROTATION_SLOTS = ["Fixo", "Ala Esquerda", "Ala Direita", "Pivô"]
# Peso heurístico por qualidade cadastrada — só serve pra montar um alvo_min
# de PARTIDA plausível (soma bate com a capacidade do jogo, pra não sair do
# solver já inviável) e um "papel" default. Nunca é dado real de desempenho.
QUALITY_WEIGHT = {"A": 3, "B": 2, "C": 1, None: 1}

DEFAULT_REGRAS = {
    "tolerancia_min_principal": 4,
    "tolerancia_min_apoio": 1,
    "max_minutos_seguidos": 6,
    "min_minutos_por_entrada": 3,
    "min_minutos_pausa": 3,
    "min_minutos_na_posicao": 3,
    "max_apoio_em_campo": 1,
    "fecho_sem_apoio_min": 4,
    "fecho_com_titulares_min": 3,
    "max_diferenca_entre_partes": 4,
    "limites_posicao": [],
}
DEFAULT_PESOS = {
    "entrada": 8,
    "momento_de_troca": 5,
    "inicio_em_posicao": 2,
    "minuto_igual_ao_plano_referencia": 0.5,
    "minuto_de_titular_no_fecho": -1,
}


def autenticar(sb):
    email = os.environ.get("TEAMBENCH_EMAIL") or input("Email Teambench: ").strip()
    password = os.environ.get("TEAMBENCH_PASSWORD") or getpass.getpass("Senha Teambench: ")
    sb.auth.sign_in_with_password({"email": email, "password": password})


def escolher_equipa(sb) -> dict:
    teams = sb.table("teams").select("id, name").order("name").execute().data
    if not teams:
        sys.exit("Nenhuma equipa encontrada pra esta conta.")
    if len(teams) == 1:
        return teams[0]
    print("\nEquipas:")
    for i, t in enumerate(teams):
        print(f"  [{i}] {t['name']}")
    i = int(input("Escolha a equipa: ").strip())
    return teams[i]


def escolher_jogo(sb, team_id: str, match_id: str | None) -> dict:
    if match_id:
        rows = sb.table("matches").select("*").eq("id", match_id).execute().data
        if not rows:
            sys.exit(f"Jogo {match_id} não encontrado (ou sem acesso).")
        return rows[0]
    matches = (
        sb.table("matches")
        .select("*")
        .eq("team_id", team_id)
        .order("match_date", desc=True)
        .limit(30)
        .execute()
        .data
    )
    if not matches:
        sys.exit("Nenhum jogo encontrado pra esta equipa.")
    print("\nJogos recentes/agendados:")
    for i, m in enumerate(matches):
        print(f"  [{i}] {m.get('match_date') or '(sem data)'} vs {m.get('opponent') or '?'} — {m.get('status')}")
    i = int(input("Escolha o jogo: ").strip())
    return matches[i]


def buscar_formato(sb, match: dict) -> tuple[int, int]:
    format_id = match.get("format_id")
    if not format_id:
        print("⚠️  Jogo sem formato definido — usando padrão 2 partes de 25 min. Ajuste 'jogo' no config gerado se precisar.")
        return 2, 25
    rows = sb.table("match_formats").select("period_count, period_minutes").eq("id", format_id).execute().data
    if not rows:
        return 2, 25
    return rows[0]["period_count"], rows[0]["period_minutes"]


def buscar_atletas(sb, team_id: str) -> list[dict]:
    return (
        sb.table("players")
        .select("id, name, number, position, active, availability_status")
        .eq("team_id", team_id)
        .eq("active", True)
        .neq("position", "Guarda-Redes")
        .neq("availability_status", "indisponivel")
        .order("number")
        .execute()
        .data
    )


def buscar_aptidoes(sb, player_ids: list[str]) -> dict[str, dict[str, str | None]]:
    if not player_ids:
        return {}
    rows = sb.table("player_aptitudes").select("player_id, slot_type, quality").in_("player_id", player_ids).execute().data
    by_player: dict[str, dict[str, str | None]] = {}
    for r in rows:
        by_player.setdefault(r["player_id"], {})[r["slot_type"]] = r["quality"]
    return by_player


def buscar_confianca_jogo(sb, match_id: str) -> dict[str, dict[str, int]]:
    rows = sb.table("rotation_plan_weights").select("player_id, slot_type, weight").eq("match_id", match_id).execute().data
    by_player: dict[str, dict[str, int]] = {}
    for r in rows:
        by_player.setdefault(r["player_id"], {})[r["slot_type"]] = r["weight"]
    return by_player


def montar_config(match: dict, partes: int, minutos_por_parte: int, players: list[dict], aptidoes: dict, confianca: dict) -> dict:
    capacidade_total = partes * minutos_por_parte * 4

    elegiveis = []
    for p in players:
        slots_aptidao = aptidoes.get(p["id"], {})
        # Posições permitidas = qualquer vaga com linha em player_aptitudes (habitual, com ou
        # sem classificação) — mesma regra já usada pelo app (specs/004-rotation-plan-generation).
        posicoes = [s for s in ROTATION_SLOTS if s in slots_aptidao]
        if not posicoes:
            continue  # atleta sem nenhuma vaga habitual cadastrada — não dá pra escalar, pula.
        elegiveis.append((p, posicoes, slots_aptidao))

    if not elegiveis:
        sys.exit("Nenhum atleta elegível (ativo, apto/a_retomar, com vaga habitual cadastrada no Plantel).")

    def melhor_qualidade(player_id: str, posicoes: list[str]) -> str | None:
        # Só considera confiança/aptidão nas vagas ELEGÍVEIS (posicoes) do atleta — uma
        # confiança alta numa vaga sem aptidão cadastrada não deveria pesar aqui.
        confs = {s: w for s, w in confianca.get(player_id, {}).items() if s in posicoes}
        if confs:
            melhor_slot = max(confs, key=confs.get)
            w = confs[melhor_slot]
            return "A" if w >= 4 else "B" if w >= 2 else "C"
        slots_aptidao = aptidoes.get(player_id, {})
        qualidades = [slots_aptidao.get(s) for s in posicoes if slots_aptidao.get(s)]
        ordem = {"A": 0, "B": 1, "C": 2}
        qualidades.sort(key=lambda q: ordem.get(q, 3))
        return qualidades[0] if qualidades else None

    pesos_atletas = []
    for p, posicoes, _ in elegiveis:
        q = melhor_qualidade(p["id"], posicoes)
        pesos_atletas.append(QUALITY_WEIGHT.get(q, 1))
    soma_pesos = sum(pesos_atletas)

    atletas = []
    titulares: dict[str, str] = {}
    soma_alvo = 0
    for idx, (p, posicoes, slots_aptidao) in enumerate(elegiveis):
        q = melhor_qualidade(p["id"], posicoes)
        papel = "principal" if q in ("A", "B") else "apoio"
        alvo = round(capacidade_total * pesos_atletas[idx] / soma_pesos) if soma_pesos else 0
        soma_alvo += alvo
        atletas.append({"nome": p["name"], "papel": papel, "posicoes": posicoes, "alvo_min": alvo})
        for slot in posicoes:
            if slots_aptidao.get(slot) == "A" and slot not in titulares:
                titulares[slot] = p["name"]

    # Ajusta o arredondamento no maior alvo_min pra soma bater exatamente com a
    # capacidade total — evita o solver já nascer inviável só por causa de
    # arredondamento (ver secção 4.2.10 da SPEC.md).
    if atletas:
        diff = capacidade_total - soma_alvo
        if diff != 0:
            maior = max(atletas, key=lambda a: a["alvo_min"])
            maior["alvo_min"] += diff

    for slot in ROTATION_SLOTS:
        if slot not in titulares:
            candidatos = [a["nome"] for a in atletas if slot in a["posicoes"]]
            titulares[slot] = candidatos[0] if candidatos else None

    return {
        "_aviso": (
            "Gerado automaticamente a partir do Plantel/Calendário do Teambench. "
            "'papel', 'alvo_min' e 'titulares' são PONTOS DE PARTIDA (heurísticos) — "
            "revise antes de rodar o solver. 'regras'/'pesos'/'limites_posicao' são "
            "os valores padrão de referência (config_exemplo.json) — ajuste conforme o jogo."
        ),
        "jogo": {"partes": partes, "minutos_por_parte": minutos_por_parte, "partes_iguais": False},
        "posicoes": ROTATION_SLOTS,
        "atletas": atletas,
        "titulares": titulares,
        "regras": DEFAULT_REGRAS,
        "pesos": DEFAULT_PESOS,
        "solver": {"tempo_limite_s": 480},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--match-id", help="UUID do jogo (pula a seleção interativa)")
    ap.add_argument("--out", help="Caminho do config.json de saída (default: saida/config_<jogo>.json)")
    args = ap.parse_args()

    load_dotenv(Path(__file__).parent / ".env")
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_ANON_KEY não configurados — copie .env.example para .env e preencha.")

    sb = create_client(url, key)
    autenticar(sb)

    team = escolher_equipa(sb)
    match = escolher_jogo(sb, team["id"], args.match_id)
    partes, minutos_por_parte = buscar_formato(sb, match)
    players = buscar_atletas(sb, team["id"])
    aptidoes = buscar_aptidoes(sb, [p["id"] for p in players])
    confianca = buscar_confianca_jogo(sb, match["id"])

    cfg = montar_config(match, partes, minutos_por_parte, players, aptidoes, confianca)

    out_dir = Path(__file__).parent / "saida"
    out_dir.mkdir(exist_ok=True)
    out_path = Path(args.out) if args.out else out_dir / f"config_{match.get('match_date') or 'jogo'}_{(match.get('opponent') or 'adversario').replace(' ', '_')}.json"
    out_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ Config gerado em {out_path}")
    print("   Revise 'papel', 'alvo_min', 'titulares' e 'limites_posicao' antes de rodar gerar.py.")


if __name__ == "__main__":
    main()
