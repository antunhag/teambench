import { useState } from "preact/hooks";
import { supabase } from "../supabaseClient";

type Mode = "magic-link" | "password";
type Status = "idle" | "sending" | "sent" | "error";

/**
 * Tela de login. Magic-link é o método principal (mais prático em campo do
 * que digitar senha num telemóvel a meio de um jogo); senha fica como
 * alternativa para quem preferir.
 *
 * O mesmo email de link mágico também traz um código de 6 dígitos — é o
 * caminho pensado para um tablet/telemóvel do clube, partilhado por várias
 * pessoas: em vez de abrir o email da conta pessoal no aparelho do clube
 * (exigindo login nele), o treinador recebe o código no seu telemóvel e só
 * digita esse código no aparelho do clube.
 */
export function Login() {
  const [mode, setMode] = useState<Mode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "checking" | "error">("idle");
  const [codeError, setCodeError] = useState("");

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

  async function confirmCode(e: Event) {
    e.preventDefault();
    setCodeStatus("checking");
    setCodeError("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      setCodeStatus("error");
      setCodeError(error.message);
      return;
    }
    // onAuthStateChange no App cuida do redirecionamento pós-login.
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
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Enviámos um link de acesso e um código para <strong>{email}</strong>.
          </p>
          <p className="hint">
            Se abrir o email neste aparelho, é só clicar no link. Se o email está noutro telemóvel (ex.: tablet
            partilhado do clube), digite abaixo o código de 6 dígitos que recebeu.
          </p>
          <form onSubmit={confirmCode} className="inline-fields">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Código</label>
              <input
                inputMode="numeric"
                required
                value={code}
                onInput={(e) => setCode((e.target as HTMLInputElement).value)}
                placeholder="123456"
                style={{ width: 120 }}
              />
            </div>
            <button type="submit" className="btn primary" disabled={codeStatus === "checking"}>
              {codeStatus === "checking" ? "A confirmar..." : "Confirmar código"}
            </button>
          </form>
          {codeStatus === "error" && <p className="banner error" style={{ marginTop: 8 }}>{codeError}</p>}
        </div>
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
