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
