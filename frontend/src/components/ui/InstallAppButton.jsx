import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function getPlatformInfo() {
  const userAgent = window.navigator.userAgent || "";
  const platform = window.navigator.platform || "";

  const isIPhone = /iphone/i.test(userAgent);
  const isIPad = /ipad/i.test(userAgent) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isIOS = isIPhone || isIPad;
  const isAndroid = /android/i.test(userAgent);
  const isWindowsPhone = /windows phone/i.test(userAgent);
  const isMac = /mac/i.test(platform) && !isIOS;
  const isWindows = /win/i.test(platform);
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isChrome = /chrome|chromium|crios/i.test(userAgent);
  const isEdge = /edg/i.test(userAgent);

  return {
    isIOS,
    isAndroid,
    isWindowsPhone,
    isMac,
    isWindows,
    isSafari,
    isChrome,
    isEdge
  };
}

export function InstallAppButton({ className = "", compact = false, iconOnly = false }) {
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__coparentalInstallPrompt || null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState("");
  const platform = useMemo(() => getPlatformInfo(), []);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return undefined;
    }

    const handlePrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      window.__coparentalInstallPrompt = event;
    };

    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setHint("");
      window.__coparentalInstallPrompt = null;
    };

    const handlePromptAvailable = () => {
      setDeferredPrompt(window.__coparentalInstallPrompt || null);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("coparental-install-available", handlePromptAvailable);
    window.addEventListener("coparental-installed", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("coparental-install-available", handlePromptAvailable);
      window.removeEventListener("coparental-installed", handleInstalled);
    };
  }, []);

  if (installed) {
    return null;
  }

  async function install() {
    setHint("");

    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      setDeferredPrompt(null);
      window.__coparentalInstallPrompt = null;
      return;
    }

    if (platform.isIOS) {
      setHint('No iPhone/iPad, toque em "Compartilhar" e depois em "Adicionar à Tela de Início".');
      return;
    }

    if (platform.isAndroid) {
      setHint('No Android, abra o menu do navegador e toque em "Instalar app" ou "Adicionar à tela inicial".');
      return;
    }

    if (platform.isMac && platform.isSafari) {
      setHint('No Safari do Mac, use Compartilhar ou Arquivo e escolha "Adicionar ao Dock".');
      return;
    }

    if (platform.isChrome || platform.isEdge || platform.isWindows) {
      setHint('No computador, use o ícone de instalar na barra de endereço ou o menu do navegador e escolha "Instalar app".');
      return;
    }

    if (platform.isWindowsPhone) {
      setHint("Windows Phone não oferece suporte moderno confiável para instalação PWA deste app.");
      return;
    }

    setHint("Se o navegador não mostrar a instalação, use o menu do navegador e procure por Instalar app ou Adicionar à tela inicial.");
  }

  return (
    <div className={`install-app-wrap ${compact ? "compact" : ""} ${className}`.trim()}>
      <button
        type="button"
        className={`install-app-button ${compact ? "compact" : ""} ${iconOnly ? "icon-only-button" : ""}`.trim()}
        onClick={install}
        aria-label="Instalar app"
        title="Instalar app"
      >
        <Download size={compact ? 16 : 18} />
        {!iconOnly ? <span>{compact ? "Instalar" : "Instalar app"}</span> : null}
      </button>
      {hint ? <p className="install-app-hint">{hint}</p> : null}
    </div>
  );
}
