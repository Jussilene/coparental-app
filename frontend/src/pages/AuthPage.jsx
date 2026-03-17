import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearStoredAppState } from "../api/client";
import { InstallAppButton } from "../components/ui/InstallAppButton";
import { useAuth } from "../contexts/AuthContext";
import { PasswordField } from "../components/ui/PasswordField";

export function AuthPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", remember: true });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { refresh } = useAuth();

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      clearStoredAppState();
      if (mode === "login") {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify(form) });
      } else {
        await api("/api/auth/register", { method: "POST", body: JSON.stringify(form) });
      }
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="hero-card">
          <p className="eyebrow">CoParental</p>
          <h1>Transparência, rotina e registro em um só lugar.</h1>
          <p>
            Organize pensão, despesas, convivência, mensagens e documentos com uma experiência acolhedora e profissional.
          </p>
        </div>
      </section>

      <section className="auth-form-panel">
        <form className="card auth-card" onSubmit={handleSubmit}>
          <div className="auth-install-row">
            <InstallAppButton compact iconOnly />
          </div>

          <div className="auth-header">
            <h2>{mode === "login" ? "Entrar no CoParental" : "Criar conta"}</h2>
            <p>{mode === "login" ? "Acesse sua família com segurança." : "Cadastre o primeiro responsável para iniciar."}</p>
          </div>

          {mode === "register" && (
            <label className="field">
              <span>Nome completo</span>
              <input name="name" value={form.name} onChange={updateField} placeholder="Seu nome" />
            </label>
          )}

          <label className="field">
            <span>E-mail</span>
            <input name="email" type="email" value={form.email} onChange={updateField} placeholder="voce@email.com" />
          </label>

          <PasswordField
            label="Senha"
            name="password"
            value={form.password}
            onChange={updateField}
            placeholder="Digite sua senha"
          />

          {mode === "login" ? (
            <div className="row between center">
              <span />
              <Link to="/redefinir-senha" className="link-button">
                Esqueci a senha
              </Link>
            </div>
          ) : null}

          {error ? <div className="alert error">{error}</div> : null}
          {message ? <div className="alert success">{message}</div> : null}

          <button className="primary-button" type="submit">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          <button type="button" className="ghost-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Ainda não tenho conta" : "Já tenho conta"}
          </button>
        </form>
      </section>
    </div>
  );
}
