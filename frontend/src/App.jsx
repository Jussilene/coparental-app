import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShell } from "./components/layout/AppShell";
import { AuthPage } from "./pages/AuthPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SupportPage } from "./pages/SupportPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ChatPage } from "./pages/ChatPage";
import { ReportsPage } from "./pages/ReportsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { InfoPage } from "./pages/InfoPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SubscriptionPendingPage } from "./pages/SubscriptionPendingPage";
import { ActivationPage } from "./pages/ActivationPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AdminPage } from "./pages/AdminPage";
import { InvitationPage } from "./pages/InvitationPage";

function ProtectedRoutes() {
  const { user, loading, familyContext } = useAuth();

  if (loading) {
    return <div className="screen-center">Carregando ambiente CoParental...</div>;
  }

  if (!user) {
    return <Navigate to="/acesso" replace />;
  }

  if (!user.is_admin && ["late", "canceled", "expired", "suspended"].includes(user.subscription_status || user.account_status)) {
    return <Navigate to="/assinatura" replace />;
  }

  if (!familyContext && !user.is_admin) {
    return <Navigate to="/onboarding" replace />;
  }

  return <AppShell />;
}

function OnboardingGuard() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="screen-center">Preparando cadastro...</div>;
  }

  if (!user) {
    return <Navigate to="/acesso" replace />;
  }

  return <OnboardingPage />;
}

function PublicOnly() {
  const { user, familyContext, loading } = useAuth();
  if (loading) {
    return <div className="screen-center">Carregando...</div>;
  }
  if (user && ["late", "canceled", "expired", "suspended"].includes(user.subscription_status || user.account_status)) {
    return <Navigate to="/assinatura" replace />;
  }
  if (user && familyContext) {
    return <Navigate to="/" replace />;
  }
  if (user) {
    return <Navigate to="/onboarding" replace />;
  }
  return <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/acesso" element={<PublicOnly />} />
        <Route path="/convite" element={<InvitationPage />} />
        <Route path="/ativar-conta" element={<ActivationPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="/assinatura" element={<SubscriptionPendingPage />} />
        <Route path="/onboarding" element={<OnboardingGuard />} />
        <Route element={<ProtectedRoutes />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pensao" element={<SupportPage />} />
          <Route path="/despesas" element={<ExpensesPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/notificacoes" element={<NotificationsPage />} />
          <Route path="/informacoes" element={<InfoPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/crm" element={<AdminPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
