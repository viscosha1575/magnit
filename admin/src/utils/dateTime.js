const MOSCOW_TIMEZONE = "Europe/Moscow";

function getValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getMoscowParts(value) {
  const date = getValidDate(value);

  if (!date) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatDateTimeMsk(value) {
  const date = getValidDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDateTimeMskWithoutSeconds(value) {
  const date = getValidDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatTimeMsk(value) {
  const date = getValidDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDateTimeInputValueMsk(value) {
  const parts = getMoscowParts(value);

  if (!parts) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function getMoscowTodayDateToken() {
  const parts = getMoscowParts(new Date());

  if (!parts) {
    return "";
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysToDateToken(dateToken, delta) {
  const [year, month, day] = String(dateToken || "").split("-").map(Number);

  if (!year || !month || !day) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(delta || 0));

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}
