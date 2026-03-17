import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { PasswordField } from "../components/ui/PasswordField";

export function ActivationPage() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    try {
      const data = await api("/api/auth/activate-account", {
        method: "POST",
        body: JSON.stringify({ token: searchParams.get("token"), password })
      });
      setMessage(data.message);
      setError("");
      setTimeout(() => navigate("/acesso"), 1200);
    } catch (err) {
      setError(err.message);
      setMessage("");
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-form-panel">
        <form className="card auth-card" onSubmit={submit}>
          <div className="auth-header">
            <h2>Ativar conta</h2>
            <p>Defina sua senha inicial para liberar o acesso ao CoParental.</p>
          </div>
          <PasswordField label="Nova senha" name="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" />
          {error ? <div className="alert error">{error}</div> : null}
          {message ? <div className="alert success">{message}</div> : null}
          <button className="primary-button">Ativar conta</button>
        </form>
      </section>
    </div>
  );
}
