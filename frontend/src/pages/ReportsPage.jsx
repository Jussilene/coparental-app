import { BarChart3, CircleDollarSign, PieChart, TrendingUp } from "lucide-react";

export function ReportsPage() {
  const monthlyExpenseData = [
    { label: "out", value: 180 },
    { label: "nov", value: 280 },
    { label: "dez", value: 260 },
    { label: "jan", value: 520 },
    { label: "fev", value: 760 },
    { label: "mar", value: 1020 },
  ];

  return (
    <div className="page page-base44 reports-reference-page">
      <div className="page-header hero-header">
        <div>
          <h1>Relatórios</h1>
          <p>Visão geral das finanças e organização</p>
        </div>
      </div>

      <section className="stats-grid reports-top reports-reference-top">
        <article className="card stat-card stat-card-base44">
          <div><span>Total Despesas</span><strong>R$ 1.554,10</strong></div>
          <div className="stat-icon blue"><BarChart3 size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44">
          <div><span>Pensão Paga</span><strong>R$ 5.000,00</strong></div>
          <div className="stat-icon green"><CircleDollarSign size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44">
          <div><span>Categorias</span><strong>6</strong></div>
          <div className="stat-icon lilac"><TrendingUp size={22} /></div>
        </article>
      </section>

      <section className="content-grid two-col reports-reference-grid">
        <article className="card panel-card chart-card reports-bar-card">
          <div className="panel-head">
            <h3><BarChart3 size={20} /> Despesas Mensais</h3>
          </div>
          <div className="reports-bar-chart" aria-hidden="true">
            <div className="reports-bar-axis">
              <span>1200</span>
              <span>900</span>
              <span>600</span>
              <span>300</span>
              <span>0</span>
            </div>
            <div className="reports-bar-stage">
              <div className="reports-bar-grid" />
              <div className="reports-bar-columns">
                {monthlyExpenseData.map((item) => (
                  <div className="reports-bar-column" key={item.label}>
                    <div className="reports-bar-track">
                      <div
                        className="reports-bar-fill"
                        style={{ height: `${(item.value / 1200) * 100}%` }}
                      />
                    </div>
                    <span className="reports-bar-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="card panel-card chart-card reports-donut-card">
          <div className="panel-head">
            <h3><PieChart size={20} /> Por Categoria</h3>
          </div>
          <div className="donut-wrap reports-donut-wrap">
            <div className="fake-donut" />
            <div className="legend-list reports-legend-list">
              <p><span className="dot blue" /> 🍎 alimentação</p>
              <p><span className="dot green" /> 🏥 saúde</p>
              <p><span className="dot gold" /> 🎮 lazer</p>
              <p><span className="dot red" /> 👕 vestuário</p>
              <p><span className="dot lilac" /> 📚 educação</p>
            </div>
          </div>
        </article>
      </section>

      <section className="content-grid one-col reports-reference-grid">
        <article className="card panel-card chart-card reports-line-card">
          <div className="panel-head">
            <h3><TrendingUp size={20} /> Evolução da Pensão</h3>
          </div>
          <div className="reports-line-chart">
            <div className="reports-line-grid" />
            <svg viewBox="0 0 1000 320" className="reports-line-svg" preserveAspectRatio="none" aria-hidden="true">
              <path className="reports-line-path paid" d="M40 280 C180 280, 250 280, 380 280 S520 40, 660 40 S820 40, 960 40" />
              <path className="reports-line-path pending" d="M40 280 C200 280, 420 280, 700 280 S900 240, 960 110" />
              <g className="reports-line-points paid">
                <circle cx="40" cy="280" r="6" />
                <circle cx="380" cy="280" r="6" />
                <circle cx="660" cy="40" r="6" />
                <circle cx="820" cy="40" r="6" />
                <circle cx="960" cy="40" r="6" />
              </g>
              <g className="reports-line-points pending">
                <circle cx="40" cy="280" r="6" />
                <circle cx="380" cy="280" r="6" />
                <circle cx="700" cy="280" r="6" />
                <circle cx="960" cy="110" r="6" />
              </g>
            </svg>
            <div className="reports-line-labels">
              <span>out</span>
              <span>nov</span>
              <span>dez</span>
              <span>jan</span>
              <span>fev</span>
              <span>mar</span>
            </div>
            <div className="reports-line-legend">
              <span className="paid">Pago</span>
              <span className="pending">Pendente</span>
            </div>
          </div>
        </article>
      </section>

      <section className="content-grid one-col">
        <article className="card report-links reports-reference-downloads">
          <a className="report-download" href="/api/reports/support" target="_blank" rel="noreferrer">Baixar relatório de pensão</a>
          <a className="report-download" href="/api/reports/expenses" target="_blank" rel="noreferrer">Baixar relatório de despesas</a>
          <a className="report-download" href="/api/reports/calendar" target="_blank" rel="noreferrer">Baixar relatório de calendário</a>
        </article>
      </section>
    </div>
  );
}
