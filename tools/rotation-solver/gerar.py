"""CLI: lê uma ou mais configs, roda o solver (secção 4), valida (secção 6) e
grava o(s) plano(s) resultante(s). Ver SPEC.md, secção 10.

Uso:
    python gerar.py config_exemplo.json
    python gerar.py cenario1.json cenario2.json cenario3.json --relaxar
    python gerar.py config_exemplo.json --saida saida/plano.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from solver import Inviavel, resolver_com_relaxamento
from validar import ValidacaoFalhou, validar_plano


def carregar_config(caminho: Path) -> dict:
    cfg = json.loads(caminho.read_text(encoding="utf-8"))
    if cfg.get("plano_referencia"):
        ref_path = caminho.parent / cfg["plano_referencia"]
        cfg["_plano_referencia"] = json.loads(ref_path.read_text(encoding="utf-8"))
    return cfg


def imprimir_plano(nome_cenario: str, cfg: dict, plano: dict) -> None:
    print(f"\n=== {nome_cenario} ===")
    for h, plan in plano.items():
        print(f"Parte {h}")
        for q, segs in plan.items():
            texto = ", ".join(f"{p} {a}-{b}" for p, a, b in segs)
            print(f"  {q}: {texto}")
    totais: dict[str, int] = {a["nome"]: 0 for a in cfg["atletas"]}
    for plan in plano.values():
        for segs in plan.values():
            for nome, a, b in segs:
                totais[nome] += b - a
    print("Minutos totais:", {n: v for n, v in totais.items()})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("configs", nargs="+", help="Caminho(s) de config.json — um por cenário")
    ap.add_argument("--relaxar", action="store_true", help="Se ficar inviável, relaxa progressivamente (secção 4.4) em vez de parar")
    ap.add_argument("--saida", help="Diretório pra gravar os planos resultantes (default: saida/)")
    args = ap.parse_args()

    out_dir = Path(args.saida) if args.saida else Path(__file__).parent / "saida"
    out_dir.mkdir(exist_ok=True, parents=True)

    falhas = []
    for caminho_str in args.configs:
        caminho = Path(caminho_str)
        nome_cenario = caminho.stem
        print(f"Resolvendo {nome_cenario}...", file=sys.stderr)
        cfg = carregar_config(caminho)
        try:
            plano, relaxados = resolver_com_relaxamento(cfg, permitir_relaxamento=args.relaxar)
        except Inviavel as e:
            print(f"❌ {nome_cenario}: {e}", file=sys.stderr)
            falhas.append(nome_cenario)
            continue

        if relaxados:
            print(f"⚠️  {nome_cenario}: config original era inviável — relaxado automaticamente: {', '.join(relaxados)}.", file=sys.stderr)

        try:
            validar_plano(cfg, plano)
        except ValidacaoFalhou as e:
            print(f"❌ {nome_cenario}: solver devolveu um plano que falhou na validação:\n{e}", file=sys.stderr)
            falhas.append(nome_cenario)
            continue

        out_path = out_dir / f"{nome_cenario}.json"
        out_path.write_text(json.dumps(plano, ensure_ascii=False, indent=1), encoding="utf-8")
        imprimir_plano(nome_cenario, cfg, plano)
        print(f"✅ Gravado em {out_path}")

    if falhas:
        sys.exit(f"\n{len(falhas)} cenário(s) falharam: {', '.join(falhas)}")


if __name__ == "__main__":
    main()
