import { CheckCircle2, Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, getUploadUrl } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { displayDateInput, normalizeDateInput, normalizeMoneyInput } from "../utils/formats";

const categories = [
  { value: "todas", label: "Todas", icon: "" },
  { value: "escola", label: "educação", icon: "📚" },
  { value: "saude", label: "saúde", icon: "🏥" },
  { value: "alimentacao", label: "alimentação", icon: "🍎" },
  { value: "vestuario", label: "vestuário", icon: "👕" },
  { value: "lazer", label: "lazer", icon: "🎮" },
  { value: "transporte", label: "transporte", icon: "🚗" },
  { value: "moradia", label: "moradia", icon: "🏠" },
  { value: "outros", label: "outros", icon: "📦" }
];

const categoryLabelMap = {
  escola: "educação",
  educacao: "educação",
  saude: "saúde",
  saúde: "saúde",
  alimentacao: "alimentação",
  alimentação: "alimentação",
  transporte: "transporte",
  roupas: "vestuário",
  vestuario: "vestuário",
  vestuário: "vestuário",
  lazer: "lazer",
  moradia: "moradia",
  outros: "outros"
};

const categoryIconMap = {
  escola: "📚",
  educacao: "📚",
  saude: "🏥",
  saúde: "🏥",
  alimentacao: "🍎",
  alimentação: "🍎",
  transporte: "🚗",
  roupas: "👕",
  vestuario: "👕",
  vestuário: "👕",
  lazer: "🎮",
  moradia: "🏠",
  outros: "📦"
};

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function normalizeCategory(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (key === "roupas") return "vestuario";
  return key || "outros";
}

function categoryLabel(value) {
  return categoryLabelMap[normalizeCategory(value)] || "outros";
}

function categoryIcon(value) {
  return categoryIconMap[normalizeCategory(value)] || "📦";
}

function paidStatus(item) {
  return item.is_shared ? "aprovado" : "pendente";
}

function parseChildIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function ExpensesPage() {
  const { familyContext, user } = useAuth();
  const [data, setData] = useState({ expenses: [] });
  const [form, setForm] = useState({
    childIds: [],
    category: "outros",
    amount: "",
    expenseDate: "",
    description: "",
    paidByUserId: "",
    isShared: true,
    attachment: null
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("todas");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState("");

  async function load() {
    try {
      const result = await api("/api/expenses");
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!form.childIds.length && familyContext?.children?.length === 1) {
      setForm((current) => ({ ...current, childIds: [familyContext.children[0].id] }));
    }
    if (!form.paidByUserId && user?.id) {
      setForm((current) => ({ ...current, paidByUserId: user.id }));
    }
  }, [familyContext?.children, form.childIds.length, form.paidByUserId, user?.id]);

  function resetForm() {
    setForm({
      childIds: familyContext?.children?.length === 1 ? [familyContext.children[0].id] : [],
      category: "outros",
      amount: "",
      expenseDate: "",
      description: "",
      paidByUserId: user?.id || "",
      isShared: true,
      attachment: null
    });
    setEditingExpenseId("");
  }

  function updateForm(event) {
    const { name, value, type, checked, files } = event.target;
    setForm((current) => ({
      ...current,
      [name]: files ? files[0] : type === "checkbox" ? checked : value
    }));
  }

  function toggleChild(childId) {
    setForm((current) => {
      const exists = current.childIds.includes(childId);
      return {
        ...current,
        childIds: exists ? current.childIds.filter((id) => id !== childId) : [...current.childIds, childId]
      };
    });
  }

  function getExpenseChildNames(item) {
    const selectedChildIds = parseChildIds(item.child_ids);
    if (selectedChildIds.length) {
      return (familyContext?.children || [])
        .filter((child) => selectedChildIds.includes(child.id))
        .map((child) => child.name);
    }
    return item.child_name ? [item.child_name] : [];
  }

  function openCreateExpenseModal() {
    resetForm();
    setExpenseModalOpen(true);
  }

  function openEditExpenseModal(item) {
    const selectedChildIds = parseChildIds(item.child_ids);
    setEditingExpenseId(item.id);
    setForm({
      childIds: selectedChildIds.length ? selectedChildIds : item.child_id ? [item.child_id] : [],
      category: normalizeCategory(item.category),
      amount: String(item.amount || "").replace(".", ","),
      expenseDate: item.expense_date || "",
      description: item.description || "",
      paidByUserId: item.paid_by_user_id || user?.id || "",
      isShared: Boolean(item.is_shared),
      attachment: null
    });
    setExpenseModalOpen(true);
  }

  async function submitExpense(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formData = new FormData();
    const payload = {
      ...form,
      category: normalizeCategory(form.category),
      amount: normalizeMoneyInput(form.amount),
      expenseDate: normalizeDateInput(form.expenseDate),
      description: String(form.description || "").trim(),
      childIds: JSON.stringify(form.childIds)
    };

    Object.entries(payload).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });

    try {
      await api(editingExpenseId ? `/api/expenses/${editingExpenseId}` : "/api/expenses", {
        method: editingExpenseId ? "PUT" : "POST",
        body: formData
      });
      setExpenseModalOpen(false);
      resetForm();
      setMessage(editingExpenseId ? "Despesa atualizada." : "Despesa registrada.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function approveExpense(expenseId) {
    try {
      setError("");
      setMessage("");
      await api(`/api/expenses/${expenseId}/approve`, { method: "POST" });
      setMessage("Despesa aprovada.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteExpense(expenseId) {
    try {
      setError("");
      setMessage("");
      await api(`/api/expenses/${expenseId}`, { method: "DELETE" });
      setMessage("Despesa excluída.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredExpenses = useMemo(() => {
    return data.expenses.filter((item) => {
      const normalized = normalizeCategory(item.category);
      const matchesCategory = activeCategory === "todas" || normalized === activeCategory;
      const childNames = getExpenseChildNames(item);
      const haystack = [
        String(item.description || ""),
        categoryLabel(item.category),
        String(item.paid_by_name || ""),
        String(item.child_name || ""),
        childNames.join(" ")
      ].join(" ").toLowerCase();
      return matchesCategory && (!query || haystack.includes(query.toLowerCase()));
    });
  }, [activeCategory, data.expenses, familyContext?.children, query]);

  const total = filteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <div className="page page-base44 expenses-reference-page">
      <div className="page-header hero-header">
        <div>
          <h1>Despesas</h1>
          <p>Registre e acompanhe os gastos da criança</p>
        </div>
        <button className="gradient-cta" type="button" onClick={openCreateExpenseModal}>
          <Plus size={18} />
          <span>Nova Despesa</span>
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="card toolbar-card expenses-toolbar-card">
        <div className="search-box expenses-search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar despesas..." />
        </div>

        <div className="chip-row expenses-chip-row">
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`filter-chip expenses-filter-chip ${activeCategory === item.value ? "active" : ""}`}
              onClick={() => setActiveCategory(item.value)}
            >
              {item.icon ? <span>{item.icon}</span> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="toolbar-total expenses-toolbar-total">
          <span>Total</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </section>

      <section className="card panel-card expense-list-card expenses-reference-list-card">
        {filteredExpenses.length ? (
          filteredExpenses.map((item) => {
            const childNames = getExpenseChildNames(item);
            const isCreator = item.created_by === user?.id;
            return (
              <article className="expense-line-item expenses-reference-item" key={item.id}>
                <div className="expenses-reference-icon">{categoryIcon(item.category)}</div>
                <div className="expense-line-copy expenses-reference-copy">
                  <strong>{item.description}</strong>
                  <p>
                    {new Date(item.expense_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    <span>•</span>
                    <span>{categoryLabel(item.category)}</span>
                    <span>•</span>
                    <span>{item.paid_by_name}</span>
                  </p>
                  {childNames.length ? <p className="expenses-reference-children">{childNames.join(" • ")}</p> : null}
                  {item.attachment_path ? (
                    <a
                      className="expenses-attachment-link"
                      href={getUploadUrl(item.attachment_path, item.attachment_name)}
                      download={item.attachment_name || true}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download size={14} />
                      <span>{item.attachment_name || "Baixar comprovante"}</span>
                    </a>
                  ) : null}
                </div>
                <div className="expense-line-meta expenses-reference-meta">
                  <strong>{formatCurrency(item.amount)}</strong>
                  <em className={`status-pill ${item.is_shared ? "approved" : "pending"}`}>{paidStatus(item)}</em>
                  <div className="expenses-line-actions">
                    {!item.is_shared ? (
                      <button type="button" className="expenses-action-button approve" onClick={() => approveExpense(item.id)} aria-label="Aprovar despesa">
                        <CheckCircle2 size={16} />
                      </button>
                    ) : null}
                    {isCreator ? (
                      <>
                        <button type="button" className="expenses-action-button edit" onClick={() => openEditExpenseModal(item)} aria-label="Editar despesa">
                          <Pencil size={16} />
                        </button>
                        <button type="button" className="expenses-action-button delete" onClick={() => deleteExpense(item.id)} aria-label="Excluir despesa">
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="support-empty-box">
            <p>Nenhuma despesa encontrada.</p>
            <small>Tente outro filtro ou registre uma nova despesa.</small>
          </div>
        )}
      </section>

      {expenseModalOpen ? (
        <div className="modal-overlay" onClick={() => {
          setExpenseModalOpen(false);
          resetForm();
        }}>
          <div className="modal-card expense-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="expenses-modal-head">
              <h3>{editingExpenseId ? "Editar Despesa" : "Nova Despesa"}</h3>
              <button type="button" className="icon-button" onClick={() => {
                setExpenseModalOpen(false);
                resetForm();
              }} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitExpense}>
              <label className="field">
                <span>Descrição</span>
                <input name="description" value={form.description} onChange={updateForm} placeholder="Ex: Material escolar" />
              </label>

              <div className="row expenses-modal-row">
                <label className="field">
                  <span>Valor (R$)</span>
                  <input name="amount" value={form.amount} onChange={updateForm} placeholder="0,00" />
                </label>
                <label className="field">
                  <span>Data</span>
                  <input name="expenseDate" value={displayDateInput(form.expenseDate)} onChange={updateForm} placeholder="dd/mm/aaaa" />
                </label>
              </div>

              <div className="row expenses-modal-row">
                <label className="field">
                  <span>Categoria</span>
                  <select name="category" value={form.category} onChange={updateForm}>
                    {categories.filter((item) => item.value !== "todas").map((item) => (
                      <option key={item.value} value={item.value}>{item.icon} {item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Pago por</span>
                  <select name="paidByUserId" value={form.paidByUserId} onChange={updateForm}>
                    <option value={user?.id || ""}>{user?.name || "Usuário logado"}</option>
                    {(familyContext?.members || [])
                      .filter((member) => member.user_id !== user?.id)
                      .map((member) => (
                        <option key={member.user_id} value={member.user_id}>{member.name}</option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="row expenses-modal-row expenses-modal-row-children">
                <label className="field">
                  <span>Criança(s)</span>
                  <div className="expenses-children-selector">
                    {(familyContext?.children || []).map((child) => (
                      <label key={child.id} className={`expenses-child-option ${form.childIds.includes(child.id) ? "selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.childIds.includes(child.id)}
                          onChange={() => toggleChild(child.id)}
                        />
                        <span>{child.name}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label className="field">
                  <span>Comprovante (opcional)</span>
                  <input name="attachment" type="file" accept=".pdf,image/*" onChange={updateForm} />
                </label>
              </div>

              <label className="checkbox expenses-shared-check">
                <input name="isShared" type="checkbox" checked={form.isShared} onChange={updateForm} />
                <span>Despesa compartilhada</span>
              </label>

              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => {
                  setExpenseModalOpen(false);
                  resetForm();
                }}>Voltar</button>
                <button className="primary-button" type="submit">{editingExpenseId ? "Salvar Alterações" : "Registrar Despesa"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
