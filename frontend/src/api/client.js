const defaultHeaders = { Accept: "application/json" };
const FAMILY_STORAGE_KEY = "copais.activeFamilyId";
const ONBOARDING_DRAFT_KEY = "copais.onboardingDraft";

function decodeMojibake(value) {
  if (typeof value !== "string") {
    return value;
  }

  let output = value;

  if (/[ÃƒÃ¢Ã°]|ï¿½/.test(output)) {
    try {
      const bytes = Uint8Array.from([...output].map((char) => char.charCodeAt(0) & 255));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (decoded && !decoded.includes("ï¿½")) {
        output = decoded;
      }
    } catch {
      // Ignore decode issues and continue with direct replacements.
    }
  }

  const replacements = new Map([
    ["Fam?lia", "Família"],
    ["M?e", "Mãe"],
    ["Pensï¿½o", "Pensão"],
    ["crianï¿½a", "criança"],
    ["Observacao", "Observação"],
    ["Configuracao", "Configuração"],
    ["Calendario", "Calendário"],
    ["Pensao", "Pensão"],
    ["Relatorios", "Relatórios"],
    ["Crianca", "Criança"],
    ["Descricao", "Descrição"],
    ["Historico", "Histórico"],
    ["Proximos", "Próximos"],
    ["Ultimas", "Últimas"],
    ["alimenticia", "alimentícia"],
    ["Mes", "Mês"],
    ["referencia", "referência"],
    ["familia", "família"],
    ["organizacao", "organização"],
    ["comunicacao", "comunicação"],
    ["documentacao", "documentação"],
    ["convivencia", "convivência"],
    ["Mae", "Mãe"],
    ["mae", "mãe"],
    ["Responsavel", "Responsável"],
    ["solicitacao", "solicitação"],
    ["solicitacoes", "solicitações"],
    ["Joao", "João"],
    ["Ola", "Olá"]
  ]);

  for (const [from, to] of replacements) {
    output = output.replaceAll(from, to);
  }

  return output;
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizePayload);
  }
  if (payload && typeof payload === "object") {
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, normalizePayload(value)]));
  }
  return decodeMojibake(payload);
}

function withActiveFamily(path) {
  if (!path.startsWith("/api/")) {
    return path;
  }

  const familyId = window.localStorage.getItem(FAMILY_STORAGE_KEY);
  if (!familyId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  if (path.includes("familyId=")) {
    return path;
  }

  return `${path}${separator}familyId=${encodeURIComponent(familyId)}`;
}

export async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(withActiveFamily(path), {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: isForm ? defaultHeaders : { ...defaultHeaders, "Content-Type": "application/json", ...(options.headers || {}) }
  });

  if (response.headers.get("content-type")?.includes("application/pdf")) {
    return response.blob();
  }

  const payload = await response.json().catch(() => ({}));
  const normalizedPayload = normalizePayload(payload);
  if (!response.ok || normalizedPayload.ok === false) {
    const error = new Error(normalizedPayload.message || "Falha na requisição.");
    error.status = response.status;
    throw error;
  }
  return normalizedPayload.data;
}

export function getStoredFamilyId() {
  return window.localStorage.getItem(FAMILY_STORAGE_KEY);
}

export function setStoredFamilyId(familyId) {
  if (!familyId) {
    window.localStorage.removeItem(FAMILY_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(FAMILY_STORAGE_KEY, familyId);
}

export function clearStoredAppState() {
  window.localStorage.removeItem(FAMILY_STORAGE_KEY);
  window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
}

export function getOnboardingDraftKey() {
  return ONBOARDING_DRAFT_KEY;
}

export function getUploadUrl(filename, name = "", options = {}) {
  if (!filename) {
    return "";
  }

  const params = new URLSearchParams();
  if (options.download !== false) {
    params.set("download", "1");
  }
  if (name) {
    params.set("name", name);
  }

  return `/api/uploads/${encodeURIComponent(filename)}?${params.toString()}`;
}
