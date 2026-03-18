import { CheckCircle2, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, clearStoredAppState } from "../api/client";
import { InstallAppButton } from "../components/ui/InstallAppButton";
import { PasswordField } from "../components/ui/PasswordField";
import { useAuth } from "../contexts/AuthContext";

function createForm(searchParams) {
  return {
    name: "",
    email: String(searchParams.get("email") || searchParams.get("payer_email") || "").trim(),
    phone: String(searchParams.get("phone") || "").trim(),
    password: "",
    confirmPassword: ""
  };
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function getPasswordStrength(password) {
  const value = String(password || "");
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (score <= 2) return { label: "Básica", className: "weak", bars: 1 };
  if (score <= 4) return { label: "Boa", className: "medium", bars: 2 };
  return { label: "Forte", className: "strong", bars: 3 };
}

function StepBullet({ icon: Icon, title, description }) {
  return (
    <div className="subscription-step-bullet">
      <span className="subscription-step-icon">
        <Icon size={18} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function SubscriptionSignupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [form, setForm] = useState(() => createForm(searchParams));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const paymentSummary = useMemo(
    () => ({
      status: String(searchParams.get("status") || searchParams.get("collection_status") || "approved").trim(),
      plan: String(searchParams.get("plan") || searchParams.get("external_reference") || "CoParental").trim(),
      reference: String(searchParams.get("preapproval_id") || searchParams.get("collection_id") || "").trim()
    }),
    [searchParams]
  );

  const passwordStrength = useMemo(() => getPasswordStrength(form.password), [form.password]);
  const passwordMatches = form.confirmPassword && form.password === form.confirmPassword;

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "phone" ? formatPhone(value) : value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    if (form.password !== form.confirmPassword) {
      setSubmitting(false);
      setError("As senhas não conferem.");
      return;
    }

    try {
      clearStoredAppState();
      await api("/api/auth/subscription-register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password
        })
      });
      await refresh();
      navigate("/onboarding");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout subscription-signup-layout">
      <section className="auth-hero subscription-hero-panel">
        <div className="hero-card subscription-hero-card">
          <div className="subscription-hero-topline">
            <span className="subscription-status-pill">
              <CheckCircle2 size={16} />
              Pagamento aprovado
            </span>
            <span className="subscription-step-pill">Último passo para acessar</span>
          </div>

          <div className="subscription-hero-copy">
            <p className="eyebrow">CoParental</p>
            <h1>Você já está quase dentro do app.</h1>
            <p>
              Seu pagamento foi confirmado. Agora falta só criar o acesso principal para começar a organizar a rotina,
              pensão, despesas e comunicação da família.
            </p>
          </div>

          <div className="subscription-summary-card">
            <div className="subscription-summary-head">
              <div>
                <strong>{paymentSummary.plan}</strong>
                <p>
                  {paymentSummary.status === "approved"
                    ? "Confirmação recebida com sucesso."
                    : `Status recebido: ${paymentSummary.status}`}
                </p>
              </div>
              <span className="subscription-summary-badge">
                <CreditCard size={16} />
                Ativo
              </span>
            </div>

            {paymentSummary.reference ? (
              <div className="subscription-summary-meta">
                <span>Referência</span>
                <strong>{paymentSummary.reference}</strong>
              </div>
            ) : null}
          </div>

          <div className="subscription-benefits-grid">
            <StepBullet
              icon={ShieldCheck}
              title="Crie seu acesso principal"
              description="Defina seus dados com segurança e entre no painel principal."
            />
            <StepBullet
              icon={Sparkles}
              title="Configure sua família"
              description="Cadastre crianças, organize a rotina e ajuste as preferências do painel."
            />
            <StepBullet
              icon={CheckCircle2}
              title="Convide o outro responsável depois"
              description="Assim que terminar o onboarding, você poderá gerar o convite de acompanhamento."
            />
          </div>
        </div>
      </section>

      <section className="auth-form-panel subscription-form-panel">
        <form className="card auth-card subscription-auth-card" onSubmit={handleSubmit}>
          <div className="auth-install-row">
            <InstallAppButton compact iconOnly />
          </div>

          <div className="subscription-form-step">Etapa 1 de 2</div>

          <div className="auth-header subscription-form-header">
            <h2>Cadastro do responsável principal</h2>
            <p>Preencha os dados abaixo. Em seguida, você será levado para a configuração inicial da família.</p>
          </div>

          <div className="subscription-inline-note">
            <ShieldCheck size={16} />
            <span>Seu acesso será criado com segurança e já ficará pronto para iniciar o onboarding.</span>
          </div>

          <div className="subscription-form-grid">
            <label className="field subscription-field subscription-field-full">
              <span>Nome completo</span>
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Nome do responsável principal"
                autoComplete="name"
              />
            </label>

            <label className="field subscription-field subscription-field-full">
              <span>E-mail</span>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
                placeholder="voce@email.com"
                autoComplete="email"
              />
            </label>

            <label className="field subscription-field subscription-field-full">
              <span>Celular</span>
              <input
                name="phone"
                value={form.phone}
                onChange={updateField}
                placeholder="(00) 00000-0000"
                autoComplete="tel"
                inputMode="numeric"
              />
            </label>

            <div className="subscription-field subscription-field-full">
              <PasswordField
                label="Senha"
                name="password"
                value={form.password}
                onChange={updateField}
                placeholder="Crie sua senha"
              />
              <div className={`password-strength-card ${passwordStrength.className}`}>
                <div className="password-strength-bars" aria-hidden="true">
                  <span className={passwordStrength.bars >= 1 ? "active" : ""} />
                  <span className={passwordStrength.bars >= 2 ? "active" : ""} />
                  <span className={passwordStrength.bars >= 3 ? "active" : ""} />
                </div>
                <span>Força da senha: {passwordStrength.label}</span>
              </div>
            </div>

            <div className="subscription-field subscription-field-full">
              <PasswordField
                label="Confirmar senha"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={updateField}
                placeholder="Repita sua senha"
              />
              <div className={`password-confirmation-hint${passwordMatches ? " match" : ""}`}>
                {form.confirmPassword
                  ? passwordMatches
                    ? "As senhas conferem."
                    : "Repita exatamente a mesma senha."
                  : "Use a mesma senha para confirmar o acesso."}
              </div>
            </div>
          </div>

          {error ? <div className="alert error">{error}</div> : null}

          <div className="subscription-form-actions">
            <button className="primary-button subscription-primary-button" type="submit" disabled={submitting}>
              {submitting ? "Criando acesso..." : "Criar acesso e continuar"}
            </button>

            <Link to="/acesso" className="ghost-button subscription-secondary-button" style={{ textAlign: "center" }}>
              Voltar para entrar
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
