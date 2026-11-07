// Classificação das recusas do servidor (specs/010-fila-recusados, research
// Decisão 1). "geral" = o problema não é do lance (rede, sessão, servidor):
// nada é posto de lado. Os outros motivos dependem do lance concreto: o lance
// passa para a lista de recusados (outbox.ts) e deixa de bloquear a fila.
//
// Regra de segurança: só é "do lance" um erro com código SQLSTATE do Postgres
// (5 caracteres) ou uma mensagem reconhecida. Um erro sem código e sem padrão
// conhecido conta como geral — pôr de lado lances válidos por um erro que não
// se percebe seria pior do que esperar.

import type { MotivoRecusa } from "./outbox";

export type Motivo = MotivoRecusa;
export type Classificacao = Motivo | "geral";

export const MOTIVOS: readonly Motivo[] = ["alterado", "sem_permissao", "nao_existe", "outro"];

interface ErroLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
}

export function detalheDoErro(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as ErroLike;
    const msg = typeof e.message === "string" ? e.message : "";
    const code = typeof e.code === "string" && e.code ? ` [${e.code}]` : "";
    return (msg + code).trim() || "sem detalhe";
  }
  return typeof err === "string" && err ? err : "sem detalhe";
}

export function classificarRecusa(err: unknown): Classificacao {
  if (!err || typeof err !== "object") return "geral";
  const e = err as ErroLike;
  const msg = (typeof e.message === "string" ? e.message : "").toLowerCase();
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : null;

  // Rede, sessão e servidor — nunca culpa do lance.
  if (
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("jwt") ||
    code.startsWith("PGRST") ||
    status === 401 ||
    status === 0 ||
    (status !== null && status >= 500)
  ) {
    return "geral";
  }

  // Guarda de UPDATE da 0026: o lance difere do que o servidor tem (corrigido na Registo).
  if (msg.includes("correcao") || msg.includes("match_events: update")) return "alterado";
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) return "sem_permissao";
  if (code === "23503" || msg.includes("foreign key")) return "nao_existe";
  if (/^[0-9A-Z]{5}$/.test(code)) return "outro";
  return "geral";
}

const TEXTO_MOTIVO: Record<Motivo, string> = {
  alterado: "o lance foi corrigido entretanto na Registo",
  sem_permissao: "a tua conta já não tem permissão nesta equipa",
  nao_existe: "o jogo ou o atleta já não existe",
  outro: "o servidor recusou o lance",
};

export function textoMotivo(m: Motivo, detalheOutro?: string): string {
  return m === "outro" && detalheOutro ? `${TEXTO_MOTIVO.outro} (detalhe: ${detalheOutro})` : TEXTO_MOTIVO[m];
}

function lances(n: number): string {
  return n === 1 ? "1 lance não foi aceite" : `${n} lances não foram aceites`;
}

/** Texto do aviso de recusados (contracts/estado-sincronizacao.md). Devolve o título e, com vários motivos, as linhas. */
export function textoRecusados(
  total: number,
  porMotivo: Partial<Record<Motivo, number>>,
  detalheOutro?: string
): { titulo: string; linhas: string[] } {
  const presentes = MOTIVOS.filter((m) => (porMotivo[m] ?? 0) > 0);
  const guardados = total === 1 ? "Fica guardado neste aparelho." : "Ficam guardados neste aparelho.";
  if (presentes.length <= 1) {
    const m = presentes[0] ?? "outro";
    return { titulo: `${lances(total)} pelo servidor: ${textoMotivo(m, detalheOutro)}. ${guardados}`, linhas: [] };
  }
  return {
    titulo: `${lances(total)} pelo servidor. ${guardados}`,
    linhas: presentes.map((m) => `${porMotivo[m]} — ${textoMotivo(m, detalheOutro)}`),
  };
}
