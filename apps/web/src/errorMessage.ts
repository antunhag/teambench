/**
 * Extrai uma mensagem legível de um erro capturado num catch.
 *
 * `err instanceof Error` sozinho não é suficiente aqui: os erros que o
 * Supabase lança (PostgrestError, AuthError) são objetos "planos" com um
 * campo `.message`, não instâncias de `Error` — então esse teste falha e o
 * código caía no fallback `String(err)`, que para um objeto vira o inútil
 * "[object Object]" em vez da mensagem real do banco.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

/**
 * Traduz uma mensagem técnica (Supabase, Postgres, rede) para português simples
 * (Princípio V da constituição). Casos conhecidos têm texto próprio; o resto
 * mostra uma frase genérica com o detalhe técnico entre parênteses, para que o
 * utilizador possa reportá-lo sem que o ecrã pareça um stack trace.
 */
export function traduzirErro(raw: string): string {
  const m = raw.toLowerCase();
  if (!m.trim()) return "Algo correu mal. Tenta outra vez.";
  if (m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror") || m.includes("network request failed")) {
    return "Sem ligação ao servidor. Verifica a internet e tenta outra vez.";
  }
  if (m.includes("correcao") || m.includes("match_events: update")) {
    return "Este registo já foi enviado e só pode ser alterado como correção. Recarrega a página e tenta outra vez.";
  }
  if (m.includes("row-level security") || m.includes("permission denied") || m.includes("not authorized")) {
    return "A tua conta não tem permissão para esta ação nesta equipa.";
  }
  if (m.includes("jwt") || m.includes("refresh token") || (m.includes("session") && m.includes("expired"))) {
    return "A sessão expirou. Sai e entra outra vez.";
  }
  if (m.includes("token has expired") || m.includes("otp") || m.includes("invalid token")) {
    return "O código não é válido ou já expirou. Pede um código novo.";
  }
  if (m.includes("rate limit") || m.includes("for security purposes") || m.includes("too many requests")) {
    return "Demasiados pedidos seguidos. Espera um minuto e tenta outra vez.";
  }
  if (m.includes("duplicate key") || m.includes("already exists")) {
    return "Este registo já existe.";
  }
  if (m.includes("timeout") || m.includes("timed out")) {
    return "O servidor demorou demasiado a responder. Tenta outra vez.";
  }
  return `Algo correu mal (detalhe: ${raw}).`;
}

/** Mensagem pronta a mostrar ao utilizador a partir de um erro capturado. */
export function textoDeErro(err: unknown): string {
  return traduzirErro(toErrorMessage(err));
}
