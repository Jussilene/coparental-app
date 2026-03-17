import dayjs from "dayjs";

export function nowIso() {
  return dayjs().toISOString();
}

export function today() {
  return dayjs().format("YYYY-MM-DD");
}

export function monthRef(date = dayjs()) {
  return dayjs(date).format("YYYY-MM");
}

export function buildDueDate(month, dueDay) {
  return dayjs(`${month}-01`).date(Math.min(Math.max(dueDay, 1), 28)).format("YYYY-MM-DD");
}

export function isPast(date) {
  return dayjs(date).endOf("day").isBefore(dayjs());
}
