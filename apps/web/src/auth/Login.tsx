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
    <div style={{ maxWidth: 360, margin: "64px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Teambench</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Entrar na sua equipa</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setMode("magic-link")}
          style={{ fontWeight: mode === "magic-link" ? 700 : 400 }}
        >
          Link mágico
        </button>
        <button
          type="button"
          onClick={() => setMode("password")}
          style={{ fontWeight: mode === "password" ? 700 : 400 }}
        >
          Senha
        </button>
      </div>

      {mode === "magic-link" && status === "sent" ? (
        <p>Enviámos um link de acesso para <strong>{email}</strong>. Abra-o neste mesmo telemóvel/navegador.</p>
      ) : (
        <form onSubmit={mode === "magic-link" ? sendMagicLink : signInWithPassword}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Email
            <input
              type="email"
              required
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>

          {mode === "password" && (
            <label style={{ display: "block", marginBottom: 8 }}>
              Senha
              <input
                type="password"
                required
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
              />
            </label>
          )}

          <button type="submit" disabled={status === "sending"} style={{ width: "100%", padding: 10, marginTop: 8 }}>
            {status === "sending" ? "A enviar..." : mode === "magic-link" ? "Enviar link mágico" : "Entrar"}
          </button>

          {status === "error" && (
            <p style={{ color: "crimson", marginTop: 8 }}>{errorMessage}</p>
          )}
        </form>
      )}
    </div>
  );
}
