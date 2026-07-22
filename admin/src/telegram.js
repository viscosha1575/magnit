const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";
const TELEGRAM_SDK_SCRIPT_ID = "telegram-web-app-sdk";

let telegramSdkPromise = null;
let telegramBootstrapPromise = null;

function isLocalAdminHost() {
  const hostname = window.location.hostname;

  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
  );
}

function isLocalAdminBypassEnabled() {
  return import.meta.env.DEV && isLocalAdminHost();
}

function extractTelegramInitDataFromLocation() {
  const candidates = [];

  if (window.location.hash.startsWith("#")) {
    candidates.push(window.location.hash.slice(1));
  }

  if (window.location.search.startsWith("?")) {
    candidates.push(window.location.search.slice(1));
  }

  for (const candidate of candidates) {
    const params = new URLSearchParams(candidate);
    const initData = params.get("tgWebAppData") || params.get("initData");

    if (initData) {
      return initData;
    }
  }

  return "";
}

function loadTelegramSdk() {
  if (window.Telegram?.WebApp) {
    return Promise.resolve(window.Telegram.WebApp);
  }

  if (!telegramSdkPromise) {
    telegramSdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(TELEGRAM_SDK_SCRIPT_ID);

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.Telegram?.WebApp), {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Не удалось загрузить Telegram SDK")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.id = TELEGRAM_SDK_SCRIPT_ID;
      script.src = TELEGRAM_SDK_URL;
      script.async = true;
      script.onload = () => resolve(window.Telegram?.WebApp);
      script.onerror = () => reject(new Error("Не удалось загрузить Telegram SDK"));
      document.body.appendChild(script);
    });
  }

  return telegramSdkPromise;
}

function toCssDimension(value, fallback = "0px") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}px`;
  }

  return fallback;
}

function resolveSafeInsetPair(primaryInset, secondaryInset, side) {
  const primaryValue = Number(primaryInset?.[side]);
  const secondaryValue = Number(secondaryInset?.[side]);
  const safePrimary = Number.isFinite(primaryValue) ? primaryValue : 0;
  const safeSecondary = Number.isFinite(secondaryValue) ? secondaryValue : 0;

  return Math.max(safePrimary, safeSecondary);
}

function bindTelegramCssVars(webApp, { fullscreenActive }) {
  const root = document.documentElement;
  const safeArea = webApp?.safeAreaInset || {};
  const contentSafeArea = webApp?.contentSafeAreaInset || safeArea;
  const topInset = fullscreenActive ? resolveSafeInsetPair(safeArea, contentSafeArea, "top") : 0;
  const rightInset = fullscreenActive ? resolveSafeInsetPair(safeArea, contentSafeArea, "right") : 0;
  const bottomInset = fullscreenActive ? resolveSafeInsetPair(safeArea, contentSafeArea, "bottom") : 0;
  const leftInset = fullscreenActive ? resolveSafeInsetPair(safeArea, contentSafeArea, "left") : 0;

  root.style.setProperty(
    "--tg-viewport-width",
    toCssDimension(webApp?.viewportWidth, `${window.innerWidth}px`)
  );
  root.style.setProperty(
    "--tg-viewport-height",
    toCssDimension(webApp?.viewportHeight, `${window.innerHeight}px`)
  );
  root.style.setProperty(
    "--tg-viewport-stable-height",
    toCssDimension(webApp?.viewportStableHeight, `${window.innerHeight}px`)
  );
  root.style.setProperty("--tg-safe-area-inset-top", toCssDimension(safeArea.top, "0px"));
  root.style.setProperty("--tg-safe-area-inset-right", toCssDimension(safeArea.right, "0px"));
  root.style.setProperty("--tg-safe-area-inset-bottom", toCssDimension(safeArea.bottom, "0px"));
  root.style.setProperty("--tg-safe-area-inset-left", toCssDimension(safeArea.left, "0px"));
  root.style.setProperty(
    "--tg-content-safe-area-inset-top",
    toCssDimension(contentSafeArea.top, "0px")
  );
  root.style.setProperty(
    "--tg-content-safe-area-inset-right",
    toCssDimension(contentSafeArea.right, "0px")
  );
  root.style.setProperty(
    "--tg-content-safe-area-inset-bottom",
    toCssDimension(contentSafeArea.bottom, "0px")
  );
  root.style.setProperty(
    "--tg-content-safe-area-inset-left",
    toCssDimension(contentSafeArea.left, "0px")
  );
  root.style.setProperty("--admin-safe-area-top", toCssDimension(topInset, "0px"));
  root.style.setProperty("--admin-safe-area-right", toCssDimension(rightInset, "0px"));
  root.style.setProperty("--admin-safe-area-bottom", toCssDimension(bottomInset, "0px"));
  root.style.setProperty("--admin-safe-area-left", toCssDimension(leftInset, "0px"));
}

function syncTelegramUiState(webApp) {
  const root = document.documentElement;
  const fullscreenActive = Boolean(webApp?.isFullscreen || document.fullscreenElement);

  root.dataset.tgFullscreen = webApp?.isFullscreen ? "true" : "false";
  root.dataset.adminFullscreen = fullscreenActive ? "true" : "false";

  bindTelegramCssVars(webApp, { fullscreenActive });
}

export function getTelegramWebAppSync() {
  return window.Telegram?.WebApp || null;
}

export function isTelegramFullscreenAvailable(webApp = getTelegramWebAppSync()) {
  return typeof webApp?.requestFullscreen === "function" && typeof webApp?.exitFullscreen === "function";
}

export function isTelegramFullscreen(webApp = getTelegramWebAppSync()) {
  return Boolean(webApp?.isFullscreen);
}

export async function toggleMiniAppFullscreen() {
  const webApp = getTelegramWebAppSync();

  if (isTelegramFullscreenAvailable(webApp)) {
    if (webApp.isFullscreen) {
      webApp.exitFullscreen();
    } else {
      webApp.requestFullscreen();
    }
    return "telegram";
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return "browser";
  }

  if (typeof document.documentElement.requestFullscreen === "function") {
    await document.documentElement.requestFullscreen();
    return "browser";
  }

  return "unsupported";
}

export async function bootstrapTelegram() {
  if (telegramBootstrapPromise) {
    return telegramBootstrapPromise;
  }

  telegramBootstrapPromise = (async () => {
    try {
      const webApp = await loadTelegramSdk();

      if (!webApp) {
        return null;
      }

      const syncState = () => {
        syncTelegramUiState(webApp);
      };

      webApp.onEvent?.("viewportChanged", syncState);
      webApp.onEvent?.("fullscreenChanged", syncState);
      webApp.onEvent?.("fullscreenFailed", syncState);
      webApp.onEvent?.("safeAreaChanged", syncState);
      webApp.onEvent?.("contentSafeAreaChanged", syncState);
      document.addEventListener("fullscreenchange", syncState);

      webApp.ready?.();
      webApp.expand?.();
      webApp.disableVerticalSwipes?.();
      syncState();

      return webApp;
    } catch (error) {
      if (!isLocalAdminBypassEnabled()) {
        throw error;
      }

      return null;
    }
  })();

  return telegramBootstrapPromise;
}

export async function getTelegramWebApp() {
  let telegramWebApp = null;

  try {
    telegramWebApp = await bootstrapTelegram();
  } catch (error) {
    if (!isLocalAdminBypassEnabled()) {
      throw error;
    }
  }

  const webApp = telegramWebApp || {};
  const initData = webApp.initData || extractTelegramInitDataFromLocation();

  if (!initData && isLocalAdminBypassEnabled()) {
    return {
      webApp: null,
      initData: "",
      isLocalBypass: true,
    };
  }

  if (!initData) {
    throw new Error("Админка доступна только внутри Telegram WebApp");
  }

  telegramWebApp?.ready?.();
  telegramWebApp?.expand?.();
  telegramWebApp?.disableVerticalSwipes?.();

  return {
    webApp: telegramWebApp || null,
    initData,
    isLocalBypass: false,
  };
}
