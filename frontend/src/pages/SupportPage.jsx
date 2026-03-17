import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Download, Pencil, Plus, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, getUploadUrl } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { displayDateInput, normalizeDateInput, normalizeMoneyInput } from "../utils/formats";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function displayMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function currentMonthRef() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthRefLabel(monthRefValue) {
  const [year, month] = String(monthRefValue || "").split("-");
  if (!year || !month) {
    return monthRefValue || "";
  }

  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  }).replace(/^\w/, (letter) => letter.toUpperCase());
}

function paymentStatusLabel(status) {
  if (status === "paid") return "Pago";
  if (status === "paid_late") return "Pago com atraso";
  if (status === "overdue") return "Atrasado";
  return "Pendente";
}

function isLatePayment(paidAt, dueDate) {
  const normalizedPaidAt = normalizeDateInput(paidAt);
  return Boolean(normalizedPaidAt && dueDate && normalizedPaidAt > dueDate);
}

export function SupportPage() {
  const { familyContext, user } = useAuth();
  const [data, setData] = useState({ settings: null, payments: [], history: [] });
  const [settingsForm, setSettingsForm] = useState({ amount: "", dueDay: "", description: "" });
  const [paymentForm, setPaymentForm] = useState({ monthRef: "", amount: "", paidAt: "", justification: "", attachment: null });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await api("/api/support");
      setData(result);
      if (result.settings) {
        setSettingsForm({
          amount: displayMoney(result.settings.amount),
          dueDay: String(result.settings.due_day || ""),
          description: result.settings.description || ""
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateSettings(event) {
    const { name, value } = event.target;
    setSettingsForm((current) => ({ ...current, [name]: value }));
  }

  function updatePayment(event) {
    const { name, value, files } = event.target;
    setPaymentForm((current) => ({ ...current, [name]: files ? files[0] : value }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const normalizedAmount = normalizeMoneyInput(settingsForm.amount);
      const normalizedDueDay = String(Number(settingsForm.dueDay || 0) || "");
      const normalizedDescription = settingsForm.description.trim();
      await api("/api/support/settings", {
        method: "POST",
        body: JSON.stringify({
          amount: normalizedAmount,
          dueDay: normalizedDueDay,
          description: normalizedDescription
        })
      });
      setData((current) => ({
        ...current,
        settings: {
          ...(current.settings || {}),
          amount: normalizedAmount,
          due_day: Number(normalizedDueDay || 0),
          description: normalizedDescription
        }
      }));
      setSettingsForm({
        amount: displayMoney(normalizedAmount),
        dueDay: normalizedDueDay,
        description: normalizedDescription
      });
      setSettingsModalOpen(false);
      setMessage("Configuração da pensão salva.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function registerPayment(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const monthReference = paymentForm.monthRef || currentMonthRef();
    const dueDate = data.settings?.due_day ? `${monthReference}-${String(data.settings.due_day).padStart(2, "0")}` : "";
    const latePayment = isLatePayment(paymentForm.paidAt, dueDate);

    if (latePayment && !paymentForm.justification.trim()) {
      setError("Informe o motivo do atraso para pagamentos fora do vencimento.");
      return;
    }

    const formData = new FormData();
    formData.append("monthRef", monthReference);
    formData.append("amount", normalizeMoneyInput(paymentForm.amount));
    formData.append("paidAt", normalizeDateInput(paymentForm.paidAt));
    formData.append("justification", paymentForm.justification.trim());
    if (paymentForm.attachment) {
      formData.append("attachment", paymentForm.attachment);
    }

    try {
      await api("/api/support/payments", { method: "POST", body: formData });
      setMessage("Pagamento registrado.");
      setPaymentForm({ monthRef: "", amount: "", paidAt: "", justification: "", attachment: null });
      setPaymentModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePaymentStatus(item, status) {
    setError("");
    setMessage("");

    try {
      const result = await api(`/api/support/payments/${item.month_ref}/status`, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      setMessage(result.message || "Status atualizado.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function preparePayment(item) {
    setPaymentForm({
      monthRef: item.month_ref || currentMonthRef(),
      amount: displayMoney(item.amount),
      paidAt: displayDateInput(new Date().toISOString().slice(0, 10)),
      justification: "",
      attachment: null
    });
    setPaymentModalOpen(true);
  }

  const historyItems = data.history?.length ? data.history : data.payments;
  const canEditSupport = familyContext?.family?.created_by === user?.id;
  const paymentDueDate = data.settings?.due_day && (paymentForm.monthRef || currentMonthRef())
    ? `${paymentForm.monthRef || currentMonthRef()}-${String(data.settings.due_day).padStart(2, "0")}`
    : "";
  const paymentNeedsReason = isLatePayment(paymentForm.paidAt, paymentDueDate);
  const supportOverview = data.settings
    ? {
        amount: formatCurrency(data.settings.amount),
        dueDay: String(data.settings.due_day || ""),
        description: data.settings.description || "Sem observações cadastradas."
      }
    : null;

  const summary = useMemo(() => {
    const paidTotal = historyItems
      .filter((item) => item.status === "paid" || item.status === "paid_late")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingTotal = historyItems
      .filter((item) => item.status === "pending" || item.status === "overdue")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const overdueCount = historyItems.filter((item) => item.status === "overdue").length;
    return { paidTotal, pendingTotal, overdueCount };
  }, [historyItems]);

  return (
    <div className="page page-base44 support-reference-page">
      <div className="page-header hero-header">
        <div>
          <h1>Pensão Alimentícia</h1>
          <p>Controle de pagamentos mensais</p>
        </div>
        {canEditSupport && !supportOverview ? (
          <button className="gradient-cta" type="button" onClick={() => setSettingsModalOpen(true)}>
            <Plus size={18} />
            <span>Cadastrar pensão</span>
          </button>
        ) : null}
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="stats-grid support-summary support-reference-summary">
        <article className="card stat-card stat-card-base44">
          <div className="support-stat-copy">
            <span>Total Pago</span>
            <strong>{formatCurrency(summary.paidTotal)}</strong>
          </div>
          <div className="stat-icon green"><CheckCircle2 size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44">
          <div className="support-stat-copy">
            <span>Pendente</span>
            <strong>{formatCurrency(summary.pendingTotal)}</strong>
          </div>
          <div className="stat-icon gold"><CalendarClock size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44">
          <div className="support-stat-copy">
            <span>Atrasados</span>
            <strong>{summary.overdueCount}</strong>
          </div>
          <div className="stat-icon rose"><AlertTriangle size={22} /></div>
        </article>
      </section>

      <section className="card panel-card support-history support-reference-history">
        <div className="panel-head">
          <h3>Histórico de Pagamentos</h3>
        </div>
        <div className="history-list support-reference-list">
          {historyItems.map((item) => {
            const isPaid = item.status === "paid" || item.status === "paid_late";
            const isPending = item.status === "pending" || item.status === "overdue";
            return (
              <div className="history-row support-reference-row" key={item.id || item.month_ref}>
                <div className={`history-icon ${item.status}`}>
                  {isPaid ? <CheckCircle2 size={22} /> : <CalendarClock size={22} />}
                </div>
                <div className="support-history-body">
                  <div className="support-history-topline">
                    <div className="history-copy support-history-inline">
                      <strong>{formatMonthRefLabel(item.month_ref)}</strong>
                      <p>
                        <CalendarDays size={14} />
                        <span>Vence em {displayDateInput(item.due_date)}</span>
                      </p>
                      {item.status === "paid_late" && item.justification ? (
                        <p className="history-reason support-history-inline-reason">{item.justification}</p>
                      ) : null}
                    </div>
                    <div className="history-meta support-history-inline-meta">
                      <strong>{formatCurrency(item.amount)}</strong>
                      <em className={`status-pill ${isPaid ? "approved" : item.status === "overdue" ? "overdue" : "pending"}`}>
                        {paymentStatusLabel(item.status)}
                      </em>
                    </div>
                    <div className="history-actions support-history-inline-actions">
                      {item.attachment_path ? (
                        <a
                          className="ghost-button support-attachment-button"
                          href={getUploadUrl(item.attachment_path, item.attachment_name)}
                          download={item.attachment_name || true}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={15} />
                          <span>{item.attachment_name || "Baixar comprovante"}</span>
                        </a>
                      ) : null}
                      {isPending ? (
                        <button type="button" className="ghost-button support-mark-paid" onClick={() => preparePayment(item)}>
                          <CheckCircle2 size={16} />
                          <span>Marcar Pago</span>
                        </button>
                      ) : null}
                      {canEditSupport && isPaid ? (
                        <div className="support-status-actions">
                          <button type="button" className="ghost-button support-status-button" onClick={() => changePaymentStatus(item, "pending")}>
                            <span>Voltar p/ pendente</span>
                          </button>
                          <button type="button" className="ghost-button support-status-button overdue" onClick={() => changePaymentStatus(item, "overdue")}>
                            <span>Marcar atraso</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="content-grid two-col support-forms support-reference-forms">
        <article className="card panel-card support-settings-card support-overview-card">
          <div className="panel-head">
            <h3>Dados da pensão</h3>
            {canEditSupport ? (
              <button type="button" className="ghost-button support-overview-edit" onClick={() => setSettingsModalOpen(true)}>
                <Pencil size={16} />
                <span>{supportOverview ? "Editar" : "Cadastrar pensão"}</span>
              </button>
            ) : null}
          </div>
          {supportOverview ? (
            <div className="support-overview-card-body">
              <div className="support-overview-hero">
                <div className="support-overview-icon">
                  <Wallet size={20} />
                </div>
                <div className="support-overview-hero-copy">
                  <span>Pensão ativa</span>
                  <strong>{supportOverview.amount}</strong>
                  <p>Vencimento todo dia {String(supportOverview.dueDay).padStart(2, "0")}</p>
                  <p>{supportOverview.description}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="support-empty-box">
              <p>A pensão ainda não foi cadastrada.</p>
              {canEditSupport ? <small>Use o botão acima para informar valor e vencimento.</small> : null}
            </div>
          )}
        </article>
      </section>

      {settingsModalOpen ? (
        <div className="modal-overlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="modal-card support-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <h3>{supportOverview ? "Editar pensão" : "Cadastrar pensão"}</h3>
            </div>
            <form onSubmit={saveSettings}>
              <label className="field"><span>Valor mensal</span><input name="amount" value={settingsForm.amount} onChange={updateSettings} placeholder="700,00" /></label>
              <label className="field"><span>Dia do vencimento</span><input name="dueDay" type="number" min="1" max="28" value={settingsForm.dueDay} onChange={updateSettings} /></label>
              <label className="field"><span>Observação</span><textarea name="description" value={settingsForm.description} onChange={updateSettings} rows="4" /></label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setSettingsModalOpen(false)}>Voltar</button>
                <button className="primary-button" type="submit">Salvar pensão</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {paymentModalOpen ? (
        <div className="modal-overlay" onClick={() => setPaymentModalOpen(false)}>
          <div className="modal-card support-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head"><h3>Registrar pagamento</h3></div>
            <form onSubmit={registerPayment}>
              <label className="field"><span>Mes de referencia</span><input name="monthRef" type="month" value={paymentForm.monthRef} onChange={updatePayment} /></label>
              <label className="field"><span>Valor pago</span><input name="amount" value={paymentForm.amount} onChange={updatePayment} placeholder="700,00" /></label>
              <label className="field"><span>Data do pagamento</span><input name="paidAt" value={displayDateInput(paymentForm.paidAt)} onChange={updatePayment} placeholder="dd/mm/aaaa" /></label>
              {paymentNeedsReason ? (
                <label className="field">
                  <span>Motivo do atraso</span>
                  <textarea name="justification" value={paymentForm.justification} onChange={updatePayment} rows="3" />
                </label>
              ) : null}
              <label className="field">
                <span>Comprovante obrigatorio</span>
                <input name="attachment" type="file" accept=".pdf,image/*" onChange={updatePayment} />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setPaymentModalOpen(false)}>Voltar</button>
                <button className="primary-button" type="submit" disabled={!paymentForm.attachment}>Registrar pagamento</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

