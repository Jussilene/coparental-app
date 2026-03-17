import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export function NotificationsPage() {
  const { refreshNotifications, pushSupported, pushSubscribed, enablePushNotifications } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [message, setMessage] = useState("");

  async function load() {
    const data = await api("/api/notifications");
    setNotifications(data.notifications);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  async function readAll() {
    await api("/api/notifications/read-all", { method: "POST", body: JSON.stringify({}) });
    await refreshNotifications();
    await load();
  }

  async function enablePush() {
    const result = await enablePushNotifications();

    if (result?.ok) {
      setMessage(
        result.reason === "already_active"
          ? "As notificações já estavam ativas neste dispositivo."
          : "Notificações do dispositivo ativadas com sucesso."
      );
      return;
    }

    if (result?.reason === "unsupported") {
      setMessage("Este dispositivo ou navegador não oferece suporte a notificações push. Em celular, o link local por IP normalmente não libera push; para testar fora do app será preciso abrir o CoParental em HTTPS.");
      return;
    }

    if (result?.reason === "denied") {
      setMessage("A permissão de notificações foi bloqueada neste dispositivo. Libere nas configurações do navegador e tente novamente.");
      return;
    }

    setMessage("Não foi possível ativar as notificações neste dispositivo. Se você ativou no computador, repita a ativação no celular. No iPhone, o app precisa estar instalado na tela inicial e aberto em ambiente compatível.");
  }

  return (
    <div className="page page-base44">
      <div className="page-header hero-header">
        <div>
          <h1>Atualizações do ambiente</h1>
          <p className="eyebrow">Notificações internas</p>
        </div>
        <div className="notifications-header-actions">
          {pushSupported ? (
            <button
              className="ghost-button notifications-read-all-button notifications-push-button"
              onClick={enablePush}
              disabled={pushSubscribed}
            >
              {pushSubscribed ? "Notificações do celular ativas" : "Ativar notificações do celular"}
            </button>
          ) : null}
          <button className="ghost-button notifications-read-all-button" onClick={readAll}>
            Marcar tudo como lido
          </button>
        </div>
      </div>
      {!pushSupported ? (
        <div className="alert success">
          As notificações fora do app não aparecem neste ambiente. No celular, isso é comum quando o CoParental está aberto por link local `http://192.168...`. Para testar push no telefone, o app precisa estar em HTTPS.
        </div>
      ) : null}
      {pushSupported && pushSubscribed ? (
        <div className="alert success">
          As notificações deste dispositivo já estão ativas para esta conta.
        </div>
      ) : null}
      {message ? <div className="alert success">{message}</div> : null}
      <section className="stack">
        {notifications.map((item) => (
          <article className="card panel-card" key={item.id}>
            <div className="list-row">
              <div>
                <strong>{item.title}</strong>
                <p>{item.content}</p>
              </div>
              <span className={`status-pill ${item.is_read ? "approved" : "pending"}`}>
                {item.is_read ? "Lida" : "Nova"}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
