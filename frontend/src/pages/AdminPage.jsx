import {
  BellRing,
  CreditCard,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserRoundX,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PasswordField } from "../components/ui/PasswordField";
import { api } from "../api/client";

function formatDate(value) {
  if (!value) {
    return "Nunca acessou";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function getCustomerStatus(customer) {
  return customer.subscription_status || customer.account_status || "active";
}

function statusLabel(status) {
  if (status === "late") return "Atrasado";
  if (status === "canceled") return "Cancelado";
  if (status === "suspended") return "Desativado";
  if (status === "active") return "Ativo";
  return status || "Sem status";
}

function statusClassName(status) {
  if (status === "active") return "approved";
  if (status === "late") return "pending";
  return "overdue";
}

const crmActions = [
  { key: "edit", label: "Editar", icon: Pencil },
  { key: "activate", label: "Ativar", icon: UserCheck },
  { key: "resend-activation", label: "Reenviar ativação", icon: BellRing },
  { key: "reset-password", label: "Resetar senha", icon: UserCog },
  { key: "suspend", label: "Desativar", icon: UserMinus },
  { key: "delete", label: "Excluir", icon: Trash2, danger: true }
];

function createCustomerForm() {
  return {
    name: "",
    email: "",
    phone: "",
    password: "",
    createPlan: true,
    planName: "Plano mensal"
  };
}

export function AdminPage() {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [message, setMessage] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createForm, setCreateForm] = useState(createCustomerForm);
  async function load() {
    const query = new URLSearchParams();
    if (filters.search) query.set("search", filters.search);
    if (filters.status) query.set("status", filters.status);

    const [customersData, statsData] = await Promise.all([
      api(`/api/admin/customers?${query.toString()}`),
      api("/api/admin/overview")
    ]);

    setCustomers(customersData.customers);
    setStats(statsData.stats);
  }

  useEffect(() => {
    load();
  }, [filters.search, filters.status]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!event.target.closest(".crm-actions-menu-wrap")) {
        setOpenMenuId(null);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function startEdit(customer) {
    setEditingId(customer.id);
    setOpenMenuId(null);
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone || "",
      roleLabel: customer.role_label || "",
      subscriptionStatus: getCustomerStatus(customer)
    });
  }

  function openCreateModal() {
    setCreateForm(createCustomerForm());
    setCreateError("");
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    setCreateError("");
    setCreateForm(createCustomerForm());
  }

  function updateCreateForm(event) {
    const { name, value, type, checked } = event.target;
    setCreateForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function submitCreateCustomer(event) {
    event.preventDefault();
    setCreatingCustomer(true);
    setCreateError("");
    setMessage("");

    try {
      const payload = {
        ...createForm,
        planName: createForm.createPlan ? createForm.planName : ""
      };
      await api("/api/admin/customers", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      closeCreateModal();
      setMessage("Usuário criado com sucesso.");
      await load();
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function saveEdit() {
    await api(`/api/admin/customers/${editingId}`, {
      method: "PUT",
      body: JSON.stringify(editForm)
    });
    setMessage("Usuário atualizado.");
    setEditingId(null);
    load();
  }

  async function adminAction(id, action) {
    setOpenMenuId(null);
    if (action === "edit") {
      const customer = customers.find((item) => item.id === id);
      if (customer) {
        startEdit(customer);
      }
      return;
    }

    if (action === "delete") {
      await api(`/api/admin/customers/${id}`, { method: "DELETE", body: JSON.stringify({}) });
      setMessage("Usuário excluído com sucesso.");
      load();
      return;
    }

    await api(`/api/admin/customers/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
    setMessage(
      action === "suspend"
        ? "Usuário desativado com sucesso."
        : action === "activate"
          ? "Usuário ativado com sucesso."
          : "Ação executada com sucesso."
    );
    load();
  }

  function toggleMenu(customerId) {
    setOpenMenuId((current) => (current === customerId ? null : customerId));
  }

  const filteredStats = useMemo(
    () => stats || { active: 0, late: 0, canceled: 0, neverAccessed: 0 },
    [stats]
  );

  return (
    <div className="page page-base44 crm-page">
      <div className="page-header hero-header crm-header">
        <div>
          <h1>CRM administrativo</h1>
          <p>Clientes Hotmart, assinaturas, ativação, status e gestão de acesso.</p>
        </div>
      </div>

      {message ? <div className="alert success">{message}</div> : null}

      <section className="stats-grid crm-stats-grid">
        <article className="card stat-card stat-card-base44 crm-stat-card">
          <div>
            <span>Ativos</span>
            <strong>{filteredStats.active}</strong>
            <small>Clientes com acesso liberado</small>
          </div>
          <div className="stat-icon green"><ShieldCheck size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44 crm-stat-card">
          <div>
            <span>Atrasados</span>
            <strong>{filteredStats.late}</strong>
            <small>Pendentes de regularização</small>
          </div>
          <div className="stat-icon gold"><CreditCard size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44 crm-stat-card">
          <div>
            <span>Cancelados</span>
            <strong>{filteredStats.canceled}</strong>
            <small>Assinaturas encerradas</small>
          </div>
          <div className="stat-icon rose"><UserRoundX size={22} /></div>
        </article>
        <article className="card stat-card stat-card-base44 crm-stat-card">
          <div>
            <span>Nunca acessou</span>
            <strong>{filteredStats.neverAccessed}</strong>
            <small>Clientes sem primeiro login</small>
          </div>
          <div className="stat-icon blue"><UserCog size={22} /></div>
        </article>
      </section>

      <section className="card crm-toolbar">
        <div className="crm-toolbar-main">
          <div className="search-box crm-search-box">
            <Search size={18} />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Buscar por nome, e-mail ou telefone"
            />
          </div>
          <button type="button" className="gradient-cta crm-create-button" onClick={openCreateModal}>
            <Plus size={16} />
            <span>Criar Usuário</span>
          </button>
        </div>

        <div className="chip-row crm-chip-row">
          {["", "active", "late", "canceled", "never_accessed"].map((status) => (
            <button
              key={status || "all"}
              type="button"
              className={`filter-chip ${filters.status === status ? "active" : ""}`}
              onClick={() => setFilters((current) => ({ ...current, status }))}
            >
              {status === "" ? "Todos" : status === "never_accessed" ? "Nunca acessou" : statusLabel(status)}
            </button>
          ))}
        </div>
      </section>

      <section className="card crm-table-card">
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Status</th>
                <th>Compra</th>
                <th>Último login</th>
                <th>Webhooks</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer, index) => {
                const customerStatus = getCustomerStatus(customer);
                const openUpward = index >= customers.length - 2;
                return (
                  <tr key={customer.id}>
                    <td>
                      {editingId === customer.id ? (
                        <div className="stack">
                          <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
                          <input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
                          <input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} />
                        </div>
                      ) : (
                        <div className="crm-customer-cell">
                          <strong>{customer.name}</strong>
                          <p>{customer.email}</p>
                          <small>{customer.phone || "Sem telefone"} • {customer.plan_name || "Sem plano"}</small>
                        </div>
                      )}
                    </td>
                    <td>
                      {editingId === customer.id ? (
                        <select value={editForm.subscriptionStatus} onChange={(event) => setEditForm((current) => ({ ...current, subscriptionStatus: event.target.value }))}>
                          <option value="active">Ativo</option>
                          <option value="late">Atrasado</option>
                          <option value="canceled">Cancelado</option>
                          <option value="suspended">Desativado</option>
                        </select>
                      ) : (
                        <span className={`status-pill ${statusClassName(customerStatus)}`}>
                          {statusLabel(customerStatus)}
                        </span>
                      )}
                    </td>
                    <td>{formatDate(customer.purchase_date || customer.created_at)}</td>
                    <td>{formatDate(customer.last_login_at)}</td>
                    <td>{customer.webhook_count}</td>
                    <td>
                      {editingId === customer.id ? (
                        <div className="crm-actions crm-actions-inline">
                          <button className="ghost-button" type="button" onClick={saveEdit}>Salvar</button>
                          <button className="ghost-button" type="button" onClick={() => setEditingId(null)}>Cancelar</button>
                        </div>
                      ) : (
                        <div className="crm-actions-menu-wrap">
                          <button
                            className={`ghost-button icon-only crm-actions-trigger${openMenuId === customer.id ? " active" : ""}`}
                            type="button"
                            onClick={() => toggleMenu(customer.id)}
                            aria-label="Abrir ações"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                          {openMenuId === customer.id ? (
                            <div className={`crm-actions-menu${openUpward ? " open-upward" : ""}`}>
                              {crmActions.map((action) => {
                                const Icon = action.icon;
                                return (
                                  <button
                                    key={action.key}
                                    className={`crm-actions-menu-item${action.danger ? " danger" : ""}`}
                                    type="button"
                                    onClick={() => adminAction(customer.id, action.key)}
                                  >
                                    <Icon size={15} />
                                    <span>{action.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="crm-mobile-list">
          {customers.map((customer) => {
            const customerStatus = getCustomerStatus(customer);
            return (
              <article key={`mobile-${customer.id}`} className="crm-mobile-card">
                <div className="crm-mobile-head">
                  <div>
                    <strong>{customer.name}</strong>
                    <p>{customer.email}</p>
                  </div>
                  <span className={`status-pill ${statusClassName(customerStatus)}`}>
                    {statusLabel(customerStatus)}
                  </span>
                </div>

                {editingId === customer.id ? (
                  <div className="stack">
                    <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
                    <input value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
                    <input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} />
                    <select value={editForm.subscriptionStatus} onChange={(event) => setEditForm((current) => ({ ...current, subscriptionStatus: event.target.value }))}>
                      <option value="active">Ativo</option>
                      <option value="late">Atrasado</option>
                      <option value="canceled">Cancelado</option>
                      <option value="suspended">Desativado</option>
                    </select>
                  </div>
                ) : (
                  <div className="crm-mobile-meta">
                    <p><strong>Telefone:</strong> {customer.phone || "Sem telefone"}</p>
                    <p><strong>Plano:</strong> {customer.plan_name || "Sem plano"}</p>
                    <p><strong>Compra:</strong> {formatDate(customer.purchase_date || customer.created_at)}</p>
                    <p><strong>Último login:</strong> {formatDate(customer.last_login_at)}</p>
                    <p><strong>Webhooks:</strong> {customer.webhook_count}</p>
                  </div>
                )}

                <div className="crm-mobile-actions">
                  {editingId === customer.id ? (
                    <>
                      <button className="ghost-button" type="button" onClick={saveEdit}>Salvar</button>
                      <button className="ghost-button" type="button" onClick={() => setEditingId(null)}>Cancelar</button>
                    </>
                  ) : (
                    <div className="crm-actions-menu-wrap mobile">
                      <button
                        className={`ghost-button icon-only crm-actions-trigger${openMenuId === customer.id ? " active" : ""}`}
                        type="button"
                        onClick={() => toggleMenu(customer.id)}
                        aria-label="Abrir ações"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {openMenuId === customer.id ? (
                        <div className="crm-actions-menu mobile">
                          {crmActions.map((action) => {
                            const Icon = action.icon;
                            return (
                              <button
                                key={`mobile-${action.key}`}
                                className={`crm-actions-menu-item${action.danger ? " danger" : ""}`}
                                type="button"
                                onClick={() => adminAction(customer.id, action.key)}
                              >
                                <Icon size={15} />
                                <span>{action.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {createModalOpen ? (
        <div className="modal-overlay" onClick={closeCreateModal}>
          <div className="modal-card crm-create-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crm-create-modal-head">
              <div>
                <h3>Criar usuário</h3>
                <p>Cadastre manualmente um novo acesso no CRM.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeCreateModal} aria-label="Fechar modal">
                <X size={18} />
              </button>
            </div>

            <form className="crm-create-form" onSubmit={submitCreateCustomer}>
              <div className="crm-create-grid">
                <label className="field">
                  <span>Nome</span>
                  <input name="name" value={createForm.name} onChange={updateCreateForm} placeholder="Nome completo" />
                </label>

                <label className="field">
                  <span>E-mail</span>
                  <input name="email" type="email" value={createForm.email} onChange={updateCreateForm} placeholder="email@dominio.com" />
                </label>

                <label className="field">
                  <span>Contato</span>
                  <input name="phone" value={createForm.phone} onChange={updateCreateForm} placeholder="(00) 00000-0000" />
                </label>

                <PasswordField
                  label="Senha"
                  name="password"
                  value={createForm.password}
                  onChange={updateCreateForm}
                  placeholder="Minimo de 6 caracteres"
                />
              </div>

              <label className="checkbox crm-plan-check">
                <input type="checkbox" name="createPlan" checked={createForm.createPlan} onChange={updateCreateForm} />
                <span>Criar usuário já com plano</span>
              </label>

              {createForm.createPlan ? (
                <label className="field">
                  <span>Plano</span>
                  <input name="planName" value={createForm.planName} onChange={updateCreateForm} placeholder="Ex.: Plano mensal" />
                </label>
              ) : null}

              {createError ? <div className="alert error">{createError}</div> : null}

              <div className="modal-actions crm-create-actions">
                <button type="button" className="ghost-button" onClick={closeCreateModal}>Cancelar</button>
                <button type="submit" className="primary-button" disabled={creatingCustomer}>
                  {creatingCustomer ? "Criando..." : "Salvar usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
