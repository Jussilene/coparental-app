import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, clearStoredAppState } from "../api/client";
import { PasswordField } from "../components/ui/PasswordField";
import { useAuth } from "../contexts/AuthContext";

function createForm(email = "") {
  return {
    name: "",
    email,
    phone: "",
    password: ""
  };
}

export function InvitationPage() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [invitation, setInvitation] = useState(null);
  const [form, setForm] = useState(createForm());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInvitation() {
      if (!token) {
        setError("Convite inválido.");
        setLoading(false);
        return;
      }

      try {
        clearStoredAppState();
        const data = await api(`/api/auth/invitations/${encodeURIComponent(token)}`);
        setInvitation(data.invitation);
        setForm(createForm(data.invitation.email || ""));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadInvitation();
  }, [token]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      clearStoredAppState();
      await api("/api/auth/invitations/register", {
        method: "POST",
        body: JSON.stringify({ ...form, token })
      });
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-form-panel">
        <form className="card auth-card" onSubmit={submit}>
          <div className="auth-header">
            <h2>Convite do CoParental</h2>
            <p>Cadastre o responsável vinculado para acessar este painel.</p>
          </div>

          {loading ? <div className="screen-center">Validando convite...</div> : null}

          {!loading && invitation ? (
            <>
              <div className="invite-box">
                <div className="invite-box-head">
                  <div>
                    <strong>{invitation.familyName}</strong>
                    <p>Você foi convidado como {invitation.relationLabel}.</p>
                  </div>
                </div>
                <div className="invite-box-meta">
                  <span>E-mail do convite</span>
                  <strong>{invitation.email || "Preencha seu e-mail abaixo"}</strong>
                </div>
              </div>

              <label className="field">
                <span>Nome completo</span>
                <input name="name" value={form.name} onChange={updateField} placeholder="Seu nome" />
              </label>

              <label className="field">
                <span>E-mail</span>
                <input name="email" type="email" value={form.email} onChange={updateField} placeholder="voce@email.com" />
              </label>

              <label className="field">
                <span>Celular</span>
                <input name="phone" value={form.phone} onChange={updateField} placeholder="(00) 00000-0000" />
              </label>

              <PasswordField
                label="Senha"
                name="password"
                value={form.password}
                onChange={updateField}
                placeholder="Mínimo de 6 caracteres"
              />
            </>
          ) : null}

          {error ? <div className="alert error">{error}</div> : null}

          {!loading && invitation ? (
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Criando acesso..." : "Criar acesso e entrar"}
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
