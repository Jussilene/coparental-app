export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function sanitizeText(value, max = 1000) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function required(value, label) {
  if (!String(value || "").trim()) {
    const error = new Error(`${label} é obrigatório.`);
    error.status = 400;
    throw error;
  }
}

export function assertEmail(email) {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
  if (!valid) {
    const error = new Error("Informe um e-mail válido.");
    error.status = 400;
    throw error;
  }
}

export function assertPassword(password) {
  if (String(password || "").length < 6) {
    const error = new Error("A senha deve ter pelo menos 6 caracteres.");
    error.status = 400;
    throw error;
  }
}
