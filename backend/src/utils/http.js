export function ok(res, data) {
  return res.json({ ok: true, data });
}

export function created(res, data) {
  return res.status(201).json({ ok: true, data });
}
