import { Pencil, Plus, Trash2, Undo2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearStoredAppState, getOnboardingDraftKey } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { displayDateInput, normalizeDateInput } from "../utils/formats";

const DRAFT_KEY = getOnboardingDraftKey();

function createChild(data = {}) {
  return {
    id: data.id || null,
    name: data.name || "",
    birthDate: data.birthDate || "",
    notes: data.notes || ""
  };
}

function createGroup(index, data = {}) {
  return {
    id: data.id || null,
    familyName: data.familyName || "",
    relationLabel: data.relationLabel || (index === 0 ? "Mãe" : "Responsável principal"),
    inviteEmail: data.inviteEmail || "",
    inviteRelationLabel: data.inviteRelationLabel || "Pai",
    children: (data.children?.length ? data.children : [createChild()]).map((child) => createChild(child))
  };
}

function normalizeDraft(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    return [createGroup(0)];
  }

  return raw.map((group, index) => createGroup(index, group));
}

function hasRealContent(groups) {
  return groups.some((group) =>
    group.familyName.trim()
      || group.inviteEmail.trim()
      || group.relationLabel.trim()
      || group.inviteRelationLabel.trim()
      || group.children.some((child) => child.name.trim() || child.birthDate || child.notes.trim())
  );
}

function groupsFromPanels(familyPanels = []) {
  if (!familyPanels.length) {
    return [createGroup(0)];
  }

  return familyPanels.map((panel, index) => {
    const ownMember = panel.members?.[0];
    const otherMember = panel.members?.[1];

    return createGroup(index, {
      id: panel.id,
      familyName: panel.name || `Painel ${index + 1}`,
      relationLabel: ownMember?.relation_label || (index === 0 ? "Mãe" : "Responsável principal"),
      inviteEmail: panel.counterpartEmail || otherMember?.email || "",
      inviteRelationLabel: panel.counterpartName || otherMember?.relation_label || "Pai",
      children: (panel.children || []).map((child) => ({
        id: child.id,
        name: child.name,
        birthDate: child.birth_date,
        notes: child.notes
      }))
    });
  });
}

function SummaryCard({ group, groupIndex, active, onEdit, onDelete, canDelete = false, compact = false }) {
  const filledChildren = group.children.filter((child) => child.name.trim());
  const childCount = filledChildren.length;
  const panelTitle = group.familyName.trim() || `Painel ${groupIndex + 1}`;
  const responsibleLine = [
    group.relationLabel.trim() || "Responsável principal",
    group.inviteRelationLabel.trim() || "Outro responsável"
  ].join(" + ");

  return (
    <div className={`onboarding-summary-card${active ? " active" : ""}${compact ? " compact" : ""}`}>
      <div className="onboarding-summary-top">
        <strong>Painel {groupIndex + 1}</strong>
        <div className="onboarding-summary-actions">
          <button type="button" className="onboarding-summary-icon" onClick={onEdit} aria-label="Editar painel">
            <Pencil size={16} />
          </button>
          {canDelete ? (
            <button type="button" className="onboarding-summary-icon danger" onClick={onDelete} aria-label="Excluir painel">
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <h3>{panelTitle}</h3>
      <p>{responsibleLine}</p>
      <div className="onboarding-summary-meta">
        <em>{childCount} criança(s)</em>
        <em>{group.inviteRelationLabel.trim() || "Outro responsável"}</em>
      </div>
      <div className="onboarding-summary-details">
        <div>
          <span>Contato</span>
          <strong>{group.inviteRelationLabel.trim() || "Outro responsável"}</strong>
        </div>
        <div>
          <span>Crianças</span>
          {childCount ? (
            <div className="onboarding-children-list">
              {filledChildren.map((child, childIndex) => (
                <div key={`${group.id || groupIndex}-${child.id || childIndex}`} className="onboarding-child-pill">
                  <strong>{child.name}</strong>
                  {child.birthDate ? <small>{displayDateInput(child.birthDate)}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <strong>Nenhum dado salvo ainda</strong>
          )}
        </div>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { refresh, familyPanels } = useAuth();

  const initialGroups = useMemo(() => {
    if (familyPanels?.length) {
      return groupsFromPanels(familyPanels);
    }

    try {
      const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null");
      if (stored?.groups?.length) {
        return normalizeDraft(stored.groups);
      }
    } catch {
      // Ignore draft parsing errors.
    }

    return [createGroup(0)];
  }, [familyPanels]);

  const [groups, setGroups] = useState(initialGroups);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [error, setError] = useState("");
  const [showEditor, setShowEditor] = useState(() => !(familyPanels?.length > 0));

  useEffect(() => {
    setGroups(initialGroups);
    setActiveGroupIndex(0);
    setShowEditor(!(familyPanels?.length > 0));
  }, [initialGroups, familyPanels]);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ groups }));
  }, [groups]);

  function updateGroup(index, field, value) {
    setGroups((current) => current.map((group, groupIndex) => (
      groupIndex === index ? { ...group, [field]: value } : group
    )));
  }

  function updateChild(groupIndex, childIndex, field, value) {
    setGroups((current) => current.map((group, index) => {
      if (index !== groupIndex) {
        return group;
      }

      return {
        ...group,
        children: group.children.map((child, itemIndex) => (
          itemIndex === childIndex ? { ...child, [field]: value } : child
        ))
      };
    }));
  }

  function addGroup() {
    setGroups((current) => {
      const nextGroups = [...current, createGroup(current.length)];
      setActiveGroupIndex(nextGroups.length - 1);
      return nextGroups;
    });
    setShowEditor(true);
  }

  function removeGroup(groupIndex) {
    setGroups((current) => {
      const nextGroups = current.filter((_, index) => index !== groupIndex);
      return nextGroups.length ? nextGroups : [createGroup(0)];
    });
    setActiveGroupIndex((current) => {
      if (current === groupIndex) {
        return Math.max(0, groupIndex - 1);
      }
      return current > groupIndex ? current - 1 : current;
    });
  }

  function addChild(groupIndex) {
    setGroups((current) => current.map((group, index) => (
      index === groupIndex
        ? { ...group, children: [...group.children, createChild()] }
        : group
    )));
  }

  function removeChild(groupIndex, childIndex) {
    setGroups((current) => current.map((group, index) => {
      if (index !== groupIndex || group.children.length === 1) {
        return group;
      }

      return {
        ...group,
        children: group.children.filter((_, itemIndex) => itemIndex !== childIndex)
      };
    }));
  }

  async function submitSetup(event) {
    event.preventDefault();
    setError("");

    try {
      const payloadGroups = groups.map((group) => ({
        ...group,
        children: group.children.map((child) => ({
          ...child,
          birthDate: normalizeDateInput(child.birthDate)
        }))
      }));

      await api("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({ groups: payloadGroups })
      });

      window.localStorage.removeItem(DRAFT_KEY);
      await refresh();
      setShowEditor(false);
      navigate("/perfil");
    } catch (err) {
      setError(err.message);
    }
  }

  async function exitOnboarding() {
    clearStoredAppState();
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch {
      // Ignore logout failures and force navigation to access page.
    }
    await refresh();
    navigate("/acesso");
  }

  function resetDraft() {
    const resetGroups = groupsFromPanels(familyPanels);
    setGroups(resetGroups);
    setActiveGroupIndex(0);
    setShowEditor(!(familyPanels?.length > 0));
    if (!familyPanels?.length) {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  }

  const activeGroup = groups[activeGroupIndex];
  const hasSavedPanels = Boolean(familyPanels?.length);
  const shouldShowCreateOnly = !hasSavedPanels && !showEditor;
  const shouldShowPreview = hasSavedPanels && !showEditor && activeGroup;

  return (
    <div className="auth-layout onboarding-layout">
      <section className="auth-form-panel">
        <form className="card auth-card large-card" onSubmit={submitSetup}>
          <div className="onboarding-topbar">
            {groups.length > 1 ? (
              <label className="field onboarding-panel-switch">
                <div className="onboarding-panel-switch-select">
                  <select
                    value={activeGroupIndex}
                    onChange={(event) => {
                      setActiveGroupIndex(Number(event.target.value));
                      setShowEditor(false);
                    }}
                  >
                    {groups.map((group, groupIndex) => (
                      <option key={`switch-${group.id || groupIndex}`} value={groupIndex}>
                        {group.familyName.trim() || `Painel ${groupIndex + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            ) : null}

            {hasSavedPanels ? (
              <Link to="/perfil" className="ghost-button icon-only small-icon-button onboarding-back-icon" aria-label="Voltar">
                <Undo2 size={18} />
              </Link>
            ) : (
              <button type="button" className="ghost-button icon-only small-icon-button onboarding-back-icon" onClick={exitOnboarding} aria-label="Sair">
                <Undo2 size={18} />
              </button>
            )}
          </div>

          <div className="auth-header">
            <h2>Configuração inicial da família</h2>
            <p>Crie um ou mais painéis de coparentalidade. Cada painel terá seus próprios filhos, responsável convidado e mensalidade separada.</p>
          </div>

          <div className="onboarding-header-actions">
            <span className="draft-badge">
              {hasRealContent(groups) ? "Rascunho salvo automaticamente" : "Preencha os dados para montar seus painéis"}
            </span>
            <div className="row">
              <button type="button" className="link-button" onClick={resetDraft}>Limpar rascunho</button>
              {!hasSavedPanels ? (
                <button type="button" className="link-button" onClick={exitOnboarding}>Sair</button>
              ) : null}
            </div>
          </div>

          {shouldShowCreateOnly ? (
            <div className="onboarding-preview-wrap">
              <button type="button" className="ghost-button onboarding-add-group onboarding-add-group-main" onClick={() => setShowEditor(true)}>
                <Plus size={16} />
                <span>Criar primeiro painel</span>
              </button>
            </div>
          ) : null}

          {shouldShowPreview ? (
            <div className="onboarding-preview-wrap">
              <SummaryCard
                group={activeGroup}
                groupIndex={activeGroupIndex}
                active
                compact
                onEdit={() => setShowEditor(true)}
                onDelete={() => removeGroup(activeGroupIndex)}
                canDelete={groups.length > 1}
              />

              <button type="button" className="ghost-button onboarding-add-group onboarding-add-group-main" onClick={addGroup}>
                <Plus size={16} />
                <span>Adicionar outro painel (pai / mãe)</span>
              </button>
            </div>
          ) : null}

          {showEditor && activeGroup ? (
            <div className="onboarding-group-list">
              <div id={`group-card-${activeGroupIndex}`} className="onboarding-group-card active">
                <div className="onboarding-group-head">
                  <div>
                    <strong>Painel {activeGroupIndex + 1}</strong>
                    <p>Você está editando somente este painel.</p>
                  </div>
                  {groups.length > 1 ? (
                    <button type="button" className="ghost-button icon-only small-icon-button" onClick={() => removeGroup(activeGroupIndex)} aria-label="Remover painel">
                      <Trash2 size={18} />
                    </button>
                  ) : null}
                </div>

                <label className="field">
                  <span>Nome do painel</span>
                  <input
                    value={activeGroup.familyName}
                    onChange={(event) => updateGroup(activeGroupIndex, "familyName", event.target.value)}
                    placeholder={`Ex.: Painel ${activeGroupIndex + 1} - Lucas`}
                  />
                </label>

                <div className="two-column-grid">
                  <label className="field">
                    <span>Como este perfil será identificado</span>
                    <input
                      value={activeGroup.relationLabel}
                      onChange={(event) => updateGroup(activeGroupIndex, "relationLabel", event.target.value)}
                      placeholder="Ex.: Mãe"
                    />
                  </label>

                  <label className="field">
                    <span>Rótulo do outro responsável</span>
                    <input
                      value={activeGroup.inviteRelationLabel}
                      onChange={(event) => updateGroup(activeGroupIndex, "inviteRelationLabel", event.target.value)}
                      placeholder="Ex.: Pai"
                    />
                  </label>
                </div>

                <label className="field">
                  <span>E-mail do outro responsável</span>
                  <input
                    type="email"
                    value={activeGroup.inviteEmail}
                    onChange={(event) => updateGroup(activeGroupIndex, "inviteEmail", event.target.value)}
                    placeholder="outro.responsavel@email.com"
                  />
                </label>

                <div className="children-section">
                  <div className="children-section-head">
                    <div className="children-section-title">
                      <Users size={18} />
                      <strong>Crianças deste painel</strong>
                    </div>
                    <button type="button" className="ghost-button add-inline-button" onClick={() => addChild(activeGroupIndex)}>
                      <Plus size={16} />
                      <span>Adicionar criança</span>
                    </button>
                  </div>

                  <div className="child-grid">
                    {activeGroup.children.map((child, childIndex) => (
                      <div key={`child-${activeGroupIndex}-${childIndex}`} className="child-card">
                        <div className="child-card-head">
                          <strong>Criança {childIndex + 1}</strong>
                          {activeGroup.children.length > 1 ? (
                            <button type="button" className="link-button" onClick={() => removeChild(activeGroupIndex, childIndex)}>
                              Remover
                            </button>
                          ) : null}
                        </div>

                        <label className="field">
                          <span>Nome da criança</span>
                          <input
                            value={child.name}
                            onChange={(event) => updateChild(activeGroupIndex, childIndex, "name", event.target.value)}
                            placeholder="Nome completo"
                          />
                        </label>

                        <div className="two-column-grid">
                          <label className="field">
                            <span>Data de nascimento</span>
                            <input
                              type="date"
                              value={normalizeDateInput(child.birthDate)}
                              onChange={(event) => updateChild(activeGroupIndex, childIndex, "birthDate", event.target.value)}
                            />
                          </label>

                          <label className="field">
                            <span>Observações</span>
                            <input
                              value={child.notes}
                              onChange={(event) => updateChild(activeGroupIndex, childIndex, "notes", event.target.value)}
                              placeholder="Opcional"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {error ? <div className="alert error">{error}</div> : null}

          {showEditor ? (
            <div className="row onboarding-actions">
              <button className="ghost-button" type="button" onClick={() => setShowEditor(false)}>
                Voltar
              </button>
              <button className="primary-button" type="submit">Salvar painéis</button>
            </div>
          ) : null}
        </form>
      </section>
    </div>
  );
}
