export function errorHandler(error, _req, res, _next) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error("[server:error]", error);
  }
  const message = status >= 500 ? "Ocorreu um erro interno no servidor." : error.message;
  return res.status(status).json({ ok: false, message });
}
