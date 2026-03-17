import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, clearStoredAppState, getStoredFamilyId, setStoredFamilyId } from "../api/client";

const AuthContext = createContext(null);

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function AuthProvider({ children }) {
  const bootstrappedRef = useRef(false);
  const [user, setUser] = useState(null);
  const [familyContext, setFamilyContext] = useState(undefined);
  const [familyPanels, setFamilyPanels] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState(typeof Notification === "undefined" ? "default" : Notification.permission);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  async function syncPushSubscriptionStatus() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      setPushSupported(false);
      setPushSubscribed(false);
      return false;
    }

    setPushSupported(true);
    setPushPermission(Notification.permission);

    if (Notification.permission !== "granted") {
      setPushSubscribed(false);
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const subscribed = Boolean(subscription);
      setPushSubscribed(subscribed);
      return subscribed;
    } catch {
      setPushSubscribed(false);
      return false;
    }
  }

  async function refreshNotifications() {
    try {
      const notificationsData = await api("/api/notifications");
      setNotifications(notificationsData.notifications || []);
    } catch (error) {
      if (error?.status === 401) {
        clearStoredAppState();
        setUser(null);
        setFamilyContext(null);
        setFamilyPanels([]);
      }
      setNotifications([]);
    }
  }

  async function bootstrap() {
    try {
      const preferredFamilyId = getStoredFamilyId();
      const data = await api(preferredFamilyId ? `/api/bootstrap?familyId=${encodeURIComponent(preferredFamilyId)}` : "/api/bootstrap");
      const notificationsData = await api("/api/notifications");
      setUser(data.user);
      setFamilyContext(data.familyContext ?? null);
      setFamilyPanels(data.familyPanels ?? data.familyContext?.families ?? []);
      setNotifications(notificationsData.notifications || []);
      if (data.familyContext?.family?.id) {
        setStoredFamilyId(data.familyContext.family.id);
      } else if (!(data.familyPanels?.length)) {
        setStoredFamilyId(null);
      }
    } catch {
      clearStoredAppState();
      setUser(null);
      setFamilyContext(null);
      setFamilyPanels([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectFamily(familyId) {
    setStoredFamilyId(familyId);
    await bootstrap();
  }

  async function enablePushNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      setPushSupported(false);
      setPushSubscribed(false);
      return { ok: false, reason: "unsupported" };
    }

    setPushSupported(true);

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== "granted") {
      setPushSubscribed(false);
      return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
    }

    try {
      const keyData = await api("/api/push/public-key");
      if (!keyData.enabled || !keyData.publicKey) {
        return { ok: false, reason: "disabled" };
      }

      const registration = await navigator.serviceWorker.ready;
      if (!registration) {
        return { ok: false, reason: "service_worker" };
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });

      await api("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription })
      });

      setPushSubscribed(true);
      return { ok: true, reason: existing ? "already_active" : "subscribed" };
    } catch {
      setPushSubscribed(false);
      return { ok: false, reason: "subscribe_failed" };
    }
  }

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;
    bootstrap();
  }, []);

  useEffect(() => {
    setPushSupported("serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined");
    syncPushSubscriptionStatus().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    const timer = setInterval(() => {
      refreshNotifications();
    }, 3000);

    return () => clearInterval(timer);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !pushSupported || pushPermission !== "granted") {
      return;
    }

    enablePushNotifications().catch(() => {});
  }, [user?.id, pushSupported, pushPermission]);

  useEffect(() => {
    if (!user?.id) {
      setPushSubscribed(false);
      return;
    }

    syncPushSubscriptionStatus().catch(() => {});
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        familyContext,
        familyPanels,
        notifications,
        chatUnreadCount: notifications.filter((item) => item.type === "chat" && !item.is_read).length,
        pushSupported,
        pushPermission,
        pushSubscribed,
        loading,
        setUser,
        setFamilyContext,
        selectFamily,
        refreshNotifications,
        enablePushNotifications,
        refresh: bootstrap
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
