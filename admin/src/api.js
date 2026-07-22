import { prepareRequestBody } from "./requestCipher";

export const API_BASE_URL =
  (
    import.meta.env.VITE_API_BASE_URL
    || (
      typeof window !== "undefined"
      && !["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname)
        ? window.location.origin
        : "http://localhost:3001"
    )
  ).replace(/\/$/, "");

let telegramInitData = "";

function normalizeAdminApiPath(path) {
  if (path === "/api") {
    return "/api/admin";
  }

  if (path.startsWith("/api/")) {
    return `/api/admin/${path.slice("/api/".length)}`;
  }

  return path;
}

export function buildApiUrl(path, baseUrl = API_BASE_URL) {
  return `${String(baseUrl || API_BASE_URL).replace(/\/$/, "")}${normalizeAdminApiPath(path)}`;
}

export function setTelegramInitData(value) {
  telegramInitData = String(value || "");
}

function buildHeaders(headers = {}) {
  const normalizedHeaders = {
    ...headers,
  };

  if (telegramInitData) {
    normalizedHeaders["X-Telegram-Init-Data"] = telegramInitData;
  }

  return normalizedHeaders;
}

export async function apiFetch(path, init = {}, baseUrl = API_BASE_URL) {
  return fetch(buildApiUrl(path, baseUrl), {
    ...init,
    headers: buildHeaders(init.headers),
  });
}

export async function postJson(path, body, options = {}) {
  const baseUrl = options.baseUrl || API_BASE_URL;
  const requestBody = await prepareRequestBody(body);
  let response;

  try {
    response = await apiFetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }, baseUrl);
  } catch (error) {
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data;
}
