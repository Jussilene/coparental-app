import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { InstallAppButton } from "../components/ui/InstallAppButton";
import { useAuth } from "../contexts/AuthContext";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export function DashboardPage() {
  const { user, familyContext } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setData(null);
    api("/api/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, [user?.id, familyContext?.family?.id]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page">Carregando dashboard...</div>;

  const totalExpenses = data.recentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const firstName = user?.name?.trim()?.split(" ")[0] || "Responsável";

  return (
    <div className="page page-base44 dashboard-reference-page">
      <div className="page-header hero-header dashboard-hero-header">
        <div className="dashboard-hero-copy">
          <h1>Olá, {firstName}! 👋</h1>
          <p>Acompanhe tudo sobre a organização familiar</p>
        </div>
        <div className="dashboard-header-actions">
          <InstallAppButton compact iconOnly />
        </div>
      </div>

      <section className="stats-grid base44-stats">
        <Link to="/despesas" className="card stat-card stat-card-base44 dashboard-card-link">
          <div>
            <span>Despesas do mês</span>
            <strong>{formatCurrency(totalExpenses)}</strong>
            <small>Total acumulado</small>
          </div>
          <div className="stat-icon blue"><ArrowUpRight size={22} /></div>
        </Link>

        <Link to="/pensao" className="card stat-card stat-card-base44 dashboard-card-link">
          <div>
            <span>Pensões pendentes</span>
            <strong>{data.latestPayment?.status === "paid" ? 0 : 1}</strong>
            <small>Aguardando pagamento</small>
          </div>
          <div className="stat-icon gold"><CircleDollarSign size={22} /></div>
        </Link>

        <Link to="/calendario" className="card stat-card stat-card-base44 dashboard-card-link">
          <div>
            <span>Eventos próximos</span>
            <strong>{data.upcomingEvents.length}</strong>
            <small>Nos próximos dias</small>
          </div>
          <div className="stat-icon green"><CalendarDays size={22} /></div>
        </Link>

        <Link to="/despesas" className="card stat-card stat-card-base44 dashboard-card-link">
          <div>
            <span>Despesas registradas</span>
            <strong>{data.recentExpenses.length}</strong>
            <small>Total de registros</small>
          </div>
          <div className="stat-icon lilac"><WalletCards size={22} /></div>
        </Link>
      </section>

      <section className="content-grid base44-panels">
        <Link to="/calendario" className="card panel-card dashboard-panel-link">
          <div className="panel-head">
            <h3>Próximos eventos</h3>
            <CalendarDays size={18} />
          </div>
          <div className="expense-feed dashboard-expense-feed dashboard-events-feed">
            {data.upcomingEvents.map((item, index) => (
              <div className="expense-feed-row dashboard-expense-row dashboard-event-row" key={item.id}>
                <div className="expense-feed-copy dashboard-expense-copy dashboard-event-copy">
                  <strong>{item.title}</strong>
                  <p>
                    {new Date(item.event_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {" • "}
                    {item.event_type}
                  </p>
                </div>
                <div className="expense-feed-meta dashboard-expense-meta dashboard-event-meta">
                  <strong>{new Date(item.event_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</strong>
                  <em className={`status-pill ${index % 2 === 0 ? "approved" : "pending"}`}>
                    {item.event_type}
                  </em>
                </div>
              </div>
            ))}
          </div>
        </Link>

        <Link to="/despesas" className="card panel-card dashboard-panel-link dashboard-expenses-panel">
          <div className="panel-head">
            <h3>Últimas despesas</h3>
            <ReceiptText size={18} />
          </div>
          <div className="expense-feed dashboard-expense-feed">
            {data.recentExpenses.map((item, index) => (
              <div key={item.id} className="expense-feed-row dashboard-expense-row">
                <div className="expense-feed-copy dashboard-expense-copy">
                  <strong>{item.description}</strong>
                  <p>
                    {new Date(item.expense_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {" • "}
                    {item.category}
                    {" • "}
                    {item.paid_by_name}
                  </p>
                </div>
                <div className="expense-feed-meta dashboard-expense-meta">
                  <strong>{formatCurrency(item.amount)}</strong>
                  <em className={`status-pill ${index % 2 === 0 ? "approved" : "pending"}`}>
                    {index % 2 === 0 ? "aprovado" : "pendente"}
                  </em>
                </div>
              </div>
            ))}
          </div>
        </Link>
      </section>
    </div>
  );
}
