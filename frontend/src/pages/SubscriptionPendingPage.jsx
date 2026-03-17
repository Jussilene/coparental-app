import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function SubscriptionPendingPage() {
  const { user } = useAuth();
  const status = user?.subscription_status || user?.account_status;

  return (
    <div className="auth-layout">
      <section className="auth-form-panel">
        <div className="card auth-card">
          <div className="auth-header">
            <h2>Assinatura com pendência</h2>
            <p>Seu acesso está temporariamente limitado até a regularização da assinatura.</p>
          </div>
          <div className="alert error">Status atual: {status || "pendente"}</div>
          <p>Se sua compra foi aprovada agora, sua conta ainda pode estar em processamento. Tente novamente em alguns minutos.</p>
          <div className="row">
            <Link className="primary-button" to="/acesso">Voltar ao login</Link>
            <Link className="ghost-button" to="/perfil">Ver meu perfil</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
