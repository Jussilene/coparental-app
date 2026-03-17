import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { PasswordField } from "../components/ui/PasswordField";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(token ? "reset" : "request");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function requestCode(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const data = await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setMessage(data.message);
      setStep("reset");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNewPassword(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const payload = token ? { token, password } : { email, code, password };
      const data = await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setMessage(data.message);
      setTimeout(() => navigate("/acesso"), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-form-panel">
        <form className="card auth-card" onSubmit={step === "request" ? requestCode : submitNewPassword}>
          <div className="auth-header">
            <h2>Redefinir senha</h2>
            <p>
              {token
                ? "Crie sua nova senha para continuar usando o CoParental."
                : step === "request"
                  ? "Informe seu e-mail para receber um código de redefinição."
                  : "Digite o código enviado ao seu e-mail e defina a nova senha."}
            </p>
          </div>

          {!token ? (
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" />
            </label>
          ) : null}

          {!token && step === "reset" ? (
            <label className="field">
              <span>Código recebido no e-mail</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Digite o código" />
            </label>
          ) : null}

          {step === "reset" || token ? (
            <PasswordField
              label="Nova senha"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo de 6 caracteres"
            />
          ) : null}

          {error ? <div className="alert error">{error}</div> : null}
          {message ? <div className="alert success">{message}</div> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            {step === "request" ? "Enviar código" : "Salvar nova senha"}
          </button>

          {!token && step === "reset" ? (
            <button type="button" className="ghost-button" onClick={requestCode} disabled={submitting}>
              Reenviar código
            </button>
          ) : null}

          <Link to="/acesso" className="ghost-button" style={{ textAlign: "center" }}>
            Voltar para entrar
          </Link>
        </form>
      </section>
    </div>
  );
}
