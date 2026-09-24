import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

type Mode = "magic-link" | "password";
type Status = "idle" | "sending" | "sent" | "error";

/**
 * Tela de login. Magic-link é o método principal (mais prático em campo do
 * que digitar senha num telemóvel a meio de um jogo); senha fica como
 * alternativa para quem preferir.
 */
export function Login() {
  const [mode, setMode] = useState<Mode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function sendMagicLink(e: Event) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");
    // emailRedirectTo preserva a URL exata (inclui ?invite=... quando veio de
    // um link de convite) — sem isto o Supabase manda de volta para o Site
    // URL configurado no dashboard, perdendo o token do convite.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  async function signInWithPassword(e: Event) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    // onAuthStateChange no App cuida do redirecionamento pós-login.
  }

  return (
    <div className="page" style={{ maxWidth: 360 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>⚽ Teambench</h1>
      <p className="hint" style={{ marginBottom: 20 }}>Entrar na sua equipa</p>

      <div className="tabs" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <div className={`tab${mode === "magic-link" ? " active" : ""}`} onClick={() => setMode("magic-link")}>
          Link mágico
        </div>
        <div className={`tab${mode === "password" ? " active" : ""}`} onClick={() => setMode("password")}>
          Senha
        </div>
      </div>

      {mode === "magic-link" && status === "sent" ? (
        <p>Enviámos um link de acesso para <strong>{email}</strong>. Abra-o neste mesmo telemóvel/navegador.</p>
      ) : (
        <form onSubmit={mode === "magic-link" ? sendMagicLink : signInWithPassword}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            />
          </div>

          {mode === "password" && (
            <div className="field">
              <label>Senha</label>
              <input
                type="password"
                required
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              />
            </div>
          )}

          <button type="submit" className="btn primary block" disabled={status === "sending"}>
            {status === "sending" ? "A enviar..." : mode === "magic-link" ? "Enviar link mágico" : "Entrar"}
          </button>

          {status === "error" && <p className="banner error" style={{ marginTop: 8 }}>{errorMessage}</p>}
        </form>
      )}
    </div>
  );
}
