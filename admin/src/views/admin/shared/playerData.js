import { postJson } from "api";
import { formatDateTimeMsk } from "utils/dateTime";

const PAGE_SIZE = 100;

export function formatDateTime(value) {
  return formatDateTimeMsk(value);
}

export function formatNullableText(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || "—";
}

export function getCompletionStateLabel(value) {
  if (value === "completed") {
    return "Успел вовремя";
  }

  if (value === "completed-after-time") {
    return "Собрал после тайм-аута";
  }

  if (value === "time-ended") {
    return "Время вышло";
  }

  return "—";
}

export function getRaffleWonLabel(value) {
  if (value === true) {
    return "Выиграл";
  }

  if (value === false) {
    return "Не выиграл";
  }

  return "Не разыграно";
}

export async function loadAllPlayers() {
  let page = 1;
  let totalPages = 1;
  const players = [];

  while (page <= totalPages) {
    const response = await postJson("/api/analytics/players", {
      page,
      pageSize: PAGE_SIZE,
      sortKey: "createdAt",
      sortDirection: "desc",
      search: "",
    });
    const nextItems = Array.isArray(response?.items) ? response.items : [];
    const nextPagination = response?.pagination ?? {};

    players.push(...nextItems);
    totalPages = Math.max(1, Number(nextPagination.totalPages) || 1);
    page += 1;
  }

  return players;
}
