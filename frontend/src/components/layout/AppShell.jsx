import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileBarChart2,
  LayoutDashboard,
  Menu,
  MessageCircle,
  ReceiptText,
  Settings,
  ShieldUser,
  X
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/pensao", label: "Pensão", icon: CircleDollarSign },
  { to: "/despesas", label: "Despesas", icon: ReceiptText },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart2 },
  { to: "/notificacoes", label: "Alertas", icon: Bell },
  { to: "/perfil", label: "Perfil", icon: Settings }
];

export function AppShell() {
  const { user, familyContext, familyPanels, selectFamily, chatUnreadCount } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleItems = user?.is_admin
    ? [...navItems, { to: "/crm", label: "CRM", icon: ShieldUser }]
    : navItems;

  const mobileItems = [navItems[0], navItems[1], navItems[2], navItems[4], navItems[7]];

  function panelLabel(panel) {
    const rawName = (panel?.name || "").trim();
    if (!rawName) {
      return "Painel";
    }

    return rawName.replace(/^Painel\s+\d+\s*[·-]\s*/i, "").trim() || rawName;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand brand-logo-only">
          <img className="brand-logo-image" src="/branding/logo-sidebar.png" alt="CoParental" />
        </div>

        {familyPanels?.length ? (
          <div className="family-switcher">
            <span>Painel ativo</span>
            <select value={familyContext?.family?.id || ""} onChange={(event) => selectFamily(event.target.value)}>
              {familyPanels.map((panel) => (
                <option key={panel.id} value={panel.id}>
                  {panelLabel(panel)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <nav className="nav-list">
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
              <item.icon size={22} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.to === "/chat" && chatUnreadCount > 0 ? <em className="menu-badge">{chatUnreadCount}</em> : null}
              <ChevronRight size={16} className="menu-arrow" />
            </NavLink>
          ))}
        </nav>

        <NavLink to="/perfil" className="profile-card">
          <div className="avatar" style={{ background: user?.avatar_color || "#59a6cb" }}>
            {user?.name?.[0] || "C"}
          </div>
          <div className="profile-card-copy">
            <strong>{user?.name}</strong>
            <p>{user?.email}</p>
          </div>
          <ChevronRight size={18} className="profile-arrow" />
        </NavLink>
      </aside>

      <main className="main-content">
        {familyPanels?.length ? (
          <div className="mobile-panel-strip">
            <div className="mobile-panel-strip-row">
              <select value={familyContext?.family?.id || ""} onChange={(event) => selectFamily(event.target.value)}>
                {familyPanels.map((panel) => (
                  <option key={panel.id} value={panel.id}>
                    {panelLabel(panel)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <div key={familyContext?.family?.id || "default"}>
          <Outlet />
        </div>
      </main>

      <nav className="mobile-nav">
        {mobileItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="mobile-link" onClick={() => setMobileMenuOpen(false)}>
            <item.icon size={18} strokeWidth={1.9} />
            <span>{item.label}</span>
            {item.to === "/chat" && chatUnreadCount > 0 ? <em className="mobile-menu-badge">{chatUnreadCount}</em> : null}
          </NavLink>
        ))}
        <button type="button" className={`mobile-link mobile-menu-trigger${mobileMenuOpen ? " active" : ""}`} onClick={() => setMobileMenuOpen((open) => !open)}>
          <Menu size={18} strokeWidth={1.9} />
          <span>Menu</span>
        </button>
      </nav>

      {mobileMenuOpen ? (
        <>
          <button type="button" className="mobile-menu-backdrop" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-menu-sheet">
            <div className="mobile-menu-sheet-head">
              <strong>Mais opções</strong>
              <button type="button" className="icon-button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="mobile-menu-sheet-links">
              {visibleItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="mobile-sheet-link" onClick={() => setMobileMenuOpen(false)}>
                  <item.icon size={18} strokeWidth={1.9} />
                  <span>{item.label}</span>
                  {item.to === "/chat" && chatUnreadCount > 0 ? <em className="mobile-sheet-badge">{chatUnreadCount}</em> : null}
                </NavLink>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
