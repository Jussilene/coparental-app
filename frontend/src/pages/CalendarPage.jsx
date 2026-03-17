import { CalendarPlus2, ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { displayDateInput, normalizeDateInput } from "../utils/formats";

const weekdayLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const eventTypeOptions = [
  { value: "convivencia", label: "Convivência", color: "blue" },
  { value: "atividade", label: "Atividade", color: "purple" },
  { value: "medico", label: "Medico", color: "red" },
  { value: "escola", label: "Escola", color: "gold" },
  { value: "feriado", label: "Feriado", color: "green" },
  { value: "evento", label: "Evento", color: "blue" }
];

function buildMonthGrid(referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(dateString) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }
  return new Date(year, month - 1, day, 12, 0, 0);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function eventMeta(type) {
  const key = normalizeText(type);
  return eventTypeOptions.find((item) => item.value === key) || eventTypeOptions[eventTypeOptions.length - 1];
}

function isDateInsideEvent(dateString, event) {
  const start = event.event_date;
  const end = event.end_date || event.event_date;
  return Boolean(start) && dateString >= start && dateString <= end;
}

function formatMonthHeading(date) {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatSelectedHeading(date) {
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

function dateTimeLabelForEvent(item) {
  const startDate = displayDateInput(item.event_date);
  const endDate = displayDateInput(item.end_date || item.event_date);
  const startTime = item.start_time || "";
  const endTime = item.end_time || "";

  if (item.end_date && item.end_date !== item.event_date) {
    const startLabel = startTime ? `${startDate} as ${startTime}` : startDate;
    const endLabel = endTime ? `${endDate} as ${endTime}` : endDate;
    return `${startLabel} ate ${endLabel}`;
  }

  if (startTime || endTime) {
    return `${startDate} | ${startTime || "--:--"}${endTime ? ` ate ${endTime}` : ""}`;
  }

  return startDate;
}

export function CalendarPage() {
  const { familyContext, user } = useAuth();
  const [data, setData] = useState({ events: [], swaps: [] });
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDateIso, setSelectedDateIso] = useState(() => toIsoDate(new Date()));
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState("");
  const [eventForm, setEventForm] = useState({
    childIds: [],
    title: "",
    eventDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    eventType: "convivencia",
    responsibleSide: "pai",
    notes: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await api("/api/calendar");
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  const selectedDate = useMemo(() => fromIsoDate(selectedDateIso), [selectedDateIso]);

  const selectedEvents = useMemo(() => (
    data.events
      .filter((item) => isDateInsideEvent(selectedDateIso, item))
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))
  ), [data.events, selectedDateIso]);

  function eventChildIds(item) {
    if (Array.isArray(item?.child_ids)) {
      return item.child_ids;
    }
    if (typeof item?.child_ids === "string" && item.child_ids.trim()) {
      try {
        const parsed = JSON.parse(item.child_ids);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return item.child_ids.split(",").map((value) => value.trim()).filter(Boolean);
      }
    }
    return item?.child_id ? [item.child_id] : [];
  }

  function childNamesForEvent(item) {
    const childrenById = new Map((familyContext?.children || []).map((child) => [child.id, child.name]));
    return eventChildIds(item).map((id) => childrenById.get(id)).filter(Boolean);
  }

  function responsibleNameForEvent(item) {
    const side = normalizeText(item?.responsible_side);

    if (side === "compartilhado") {
      return "Compartilhado";
    }

    const matchedMember = (familyContext?.members || []).find((member) => {
      const relation = normalizeText(member?.relation_label);
      return relation === side || relation.includes(side);
    });

    if (matchedMember?.name) return matchedMember.name;
    if (side === "pai") return "Pai";
    if (side === "mae") return "Mãe";
    return item?.responsible_side || "";
  }

  function resetForm(dateIso = selectedDateIso) {
    setEditingEventId("");
    setEventForm({
      childIds: familyContext?.children?.[0]?.id ? [familyContext.children[0].id] : [],
      title: "",
      eventDate: dateIso,
      endDate: dateIso,
      startTime: "",
      endTime: "",
      eventType: "convivencia",
      responsibleSide: "pai",
      notes: ""
    });
  }

  function openEventForm(dateIso = selectedDateIso) {
    resetForm(dateIso);
    setShowEventForm(true);
  }

  function closeEventForm() {
    setShowEventForm(false);
    resetForm(selectedDateIso);
  }

  function changeEvent(event) {
    const { name, value, checked } = event.target;
    if (name === "childIds") {
      setEventForm((current) => ({
        ...current,
        childIds: checked
          ? [...current.childIds, value]
          : current.childIds.filter((item) => item !== value)
      }));
      return;
    }
    setEventForm((current) => ({ ...current, [name]: value }));
  }

  function editEvent(item) {
    setEditingEventId(item.id);
    setShowEventForm(true);
    setSelectedDateIso(item.event_date);
    setEventForm({
      childIds: eventChildIds(item),
      title: item.title || "",
      eventDate: item.event_date || "",
      endDate: item.end_date || item.event_date || "",
      startTime: item.start_time || "",
      endTime: item.end_time || "",
      eventType: normalizeText(item.event_type) || "convivencia",
      responsibleSide: normalizeText(item.responsible_side) || "pai",
      notes: item.notes || ""
    });
  }

  async function saveEvent(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const payload = {
        ...eventForm,
        childIds: eventForm.childIds,
        title: eventForm.title.trim(),
        notes: eventForm.notes.trim(),
        eventDate: normalizeDateInput(eventForm.eventDate),
        endDate: normalizeDateInput(eventForm.endDate) || normalizeDateInput(eventForm.eventDate)
      };

      const optimisticEvent = {
        id: editingEventId || `temp-${Date.now()}`,
        child_id: payload.childIds[0] || null,
        child_ids: payload.childIds,
        title: payload.title,
        event_date: payload.eventDate,
        end_date: payload.endDate,
        start_time: payload.startTime || null,
        end_time: payload.endTime || null,
        event_type: payload.eventType,
        responsible_side: payload.responsibleSide,
        notes: payload.notes,
        created_by: user?.id
      };

      const result = await api(
        editingEventId ? `/api/calendar/events/${editingEventId}` : "/api/calendar/events",
        {
          method: editingEventId ? "PUT" : "POST",
          body: JSON.stringify(payload)
        }
      );

      const savedEvent = result?.event || optimisticEvent;
      const savedDate = fromIsoDate(payload.eventDate);
      setSelectedDateIso(payload.eventDate);
      setCurrentMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1));

      setData((current) => ({
        ...current,
        events: editingEventId
          ? current.events.map((item) => (item.id === editingEventId ? savedEvent : item))
          : [...current.events, savedEvent]
      }));

      setMessage(editingEventId ? "Evento atualizado no calendario." : "Evento salvo no calendario.");
      closeEventForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteEvent(eventId) {
    setError("");
    setMessage("");

    try {
      await api(`/api/calendar/events/${eventId}`, { method: "DELETE" });
      setData((current) => ({ ...current, events: current.events.filter((item) => item.id !== eventId) }));
      setMessage("Evento removido.");
    } catch (err) {
      setError(err.message);
    }
  }

  function dotsForDate(dateString) {
    return Array.from(
      new Set(
        data.events
          .filter((item) => isDateInsideEvent(dateString, item))
          .map((item) => eventMeta(item.event_type).color)
      )
    ).slice(0, 3);
  }

  return (
    <div className="page page-base44 calendar-reference-page">
      <div className="page-header hero-header calendar-page-header">
        <div>
          <h1>Calendário</h1>
          <p>Organize convivência, retorno, consultas e compromissos.</p>
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="content-grid calendar-layout reference-layout">
        <article className="card calendar-card reference-calendar-card">
          <div className="calendar-topbar reference-calendar-topbar">
            <div className="calendar-nav">
              <button
                type="button"
                className="ghost-button icon-only"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              >
                <ChevronLeft size={18} />
              </button>
              <h2>{formatMonthHeading(currentMonth)}</h2>
              <button
                type="button"
                className="ghost-button icon-only"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="calendar-grid reference-calendar-grid">
            {weekdayLabels.map((day) => (
              <span key={day} className="calendar-weekday">{day}</span>
            ))}

            {monthGrid.map((date, index) => {
              const dateString = toIsoDate(date);
              const isSelected = selectedDateIso === dateString;
              const dots = dotsForDate(dateString);

              return (
                <button
                  type="button"
                  key={`${dateString}-${index}`}
                  className={`calendar-day reference-calendar-day ${date.getMonth() !== currentMonth.getMonth() ? "outside" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDateIso(dateString)}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  <div className="calendar-day-dots">
                    {dots.map((tone) => (
                      <i key={`${dateString}-${tone}`} className={`day-dot tone-${tone}`} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </article>

        <aside className="card side-calendar-card reference-side-calendar">
          <div className="selected-date-head">
            <h3>{formatSelectedHeading(selectedDate)}</h3>
            <p>{selectedEvents.length} evento(s)</p>
          </div>

          <button type="button" className="calendar-add-event-button" onClick={() => openEventForm(selectedDateIso)}>
            <Plus size={18} />
            <span>Adicionar evento</span>
          </button>

          {showEventForm ? (
            <form className="calendar-inline-form" onSubmit={saveEvent}>
              <label className="field">
                <span>Crianças</span>
                <div className="calendar-children-checklist">
                  {(familyContext?.children || []).map((child) => (
                    <label key={child.id} className="calendar-child-option">
                      <input
                        type="checkbox"
                        name="childIds"
                        value={child.id}
                        checked={eventForm.childIds.includes(child.id)}
                        onChange={changeEvent}
                      />
                      <span>{child.name}</span>
                    </label>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Título</span>
                <input name="title" value={eventForm.title} onChange={changeEvent} placeholder="Ex.: Final de semana com o pai" />
              </label>

              <div className="row">
                <label className="field">
                  <span>Saída</span>
                  <input name="eventDate" value={displayDateInput(eventForm.eventDate)} onChange={changeEvent} placeholder="dd/mm/aaaa" />
                </label>
                <label className="field">
                  <span>Retorno</span>
                  <input name="endDate" value={displayDateInput(eventForm.endDate)} onChange={changeEvent} placeholder="dd/mm/aaaa" />
                </label>
              </div>

              <div className="row">
                <label className="field">
                  <span>Hora saida</span>
                  <input name="startTime" type="time" value={eventForm.startTime} onChange={changeEvent} />
                </label>
                <label className="field">
                  <span>Hora retorno</span>
                  <input name="endTime" type="time" value={eventForm.endTime} onChange={changeEvent} />
                </label>
              </div>

              <div className="row">
                <label className="field">
                  <span>Tipo</span>
                  <select name="eventType" value={eventForm.eventType} onChange={changeEvent}>
                    {eventTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Responsável</span>
                  <select name="responsibleSide" value={eventForm.responsibleSide} onChange={changeEvent}>
                    <option value="pai">Pai</option>
                    <option value="mae">Mãe</option>
                    <option value="compartilhado">Compartilhado</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Observações</span>
                <textarea name="notes" rows="3" value={eventForm.notes} onChange={changeEvent} placeholder="Detalhes da retirada, devolucao ou compromisso" />
              </label>

              <div className="calendar-inline-actions">
                <button type="button" className="ghost-button" onClick={closeEventForm}>Cancelar</button>
                <button className="primary-button" type="submit">{editingEventId ? "Salvar edição" : "Salvar"}</button>
              </div>
            </form>
          ) : null}

          <div className="selected-events-list">
            {selectedEvents.map((item) => {
              const tone = eventMeta(item.event_type).color;
              const canManage = item.created_by === user?.id;
              const childNames = childNamesForEvent(item);
              return (
                <article key={item.id} className={`calendar-event-card tone-${tone}`}>
                  <div className="calendar-event-card-top">
                    <strong>{item.title}</strong>
                    <div className="calendar-event-card-actions">
                      {canManage ? (
                        <>
                          <button type="button" className="calendar-event-edit" onClick={() => editEvent(item)} aria-label="Editar evento">
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="calendar-event-remove" onClick={() => deleteEvent(item.id)} aria-label="Excluir evento">
                            <X size={16} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="calendar-event-card-meta">
                    <p className={`calendar-event-type tone-${tone}`}>{eventMeta(item.event_type).label}</p>
                    {responsibleNameForEvent(item) ? <p className="calendar-event-responsible">{responsibleNameForEvent(item)}</p> : null}
                  </div>

                  {childNames.length ? (
                    <div className="calendar-event-children">
                      {childNames.map((childName) => (
                        <span key={`${item.id}-${childName}`} className="calendar-event-child-pill">{childName}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="calendar-event-card-details">
                    {(item.event_date || item.start_time || item.end_time) ? (
                      <small className="calendar-event-detail calendar-event-detail-inline">
                        <span>{dateTimeLabelForEvent(item)}</span>
                      </small>
                    ) : null}
                    {item.notes ? <small className="calendar-event-note">{item.notes}</small> : null}
                  </div>
                </article>
              );
            })}

            {!selectedEvents.length ? (
              <div className="calendar-empty-state">
                <CalendarPlus2 size={22} />
                <p>Nenhum evento neste dia.</p>
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </div>
  );
}
