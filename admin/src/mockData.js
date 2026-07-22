const labelsByRange = {
  today: ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
  "7d": ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  "30d": ["1 июл", "6 июл", "11 июл", "16 июл", "21 июл", "26 июл", "30 июл"],
  all: ["Фев", "Мар", "Апр", "Май", "Июн", "Июл"],
};

const seriesValues = {
  today: [[18, 31, 56, 74, 103, 128, 151], [6, 14, 27, 39, 58, 72, 91]],
  "7d": [[198, 246, 271, 305, 392, 481, 436], [112, 139, 158, 181, 236, 294, 267]],
  "30d": [[742, 986, 1214, 1538, 1841, 2160, 2498], [421, 574, 708, 917, 1102, 1318, 1534]],
  all: [[1280, 1960, 2840, 4160, 6030, 8420], [730, 1180, 1740, 2610, 3890, 5520]],
};

const multipliers = { today: 1, "7d": 6, "30d": 24, all: 73 };

export function shouldUseAnalyticsMocks() {
  if (import.meta.env.VITE_USE_ANALYTICS_MOCKS === "true") return true;
  if (import.meta.env.VITE_USE_ANALYTICS_MOCKS === "false") return false;
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
}

export function createAnalyticsMock(range = "7d") {
  const safeRange = labelsByRange[range] ? range : "7d";
  const factor = multipliers[safeRange];
  const labels = labelsByRange[safeRange];
  const [visits, translations] = seriesValues[safeRange];

  return {
    summary: {
      uniqueUsers: 436 * factor,
      sessions: 512 * factor,
      pageViews: 1384 * factor,
      inputUsers: 354 * factor,
      translationRequests: 291 * factor,
      successfulTranslations: 267 * factor,
      shareOpens: 94 * factor,
      telegramShares: 51 * factor,
      downloads: 38 * factor,
      vacanciesClicks: 63 * factor,
    },
    events: [
      ["page_view", 1384], ["profession_input_changed", 354],
      ["translation_requested", 291], ["translation_succeeded", 267],
      ["share_opened", 94], ["telegram_share_opened", 51],
      ["result_downloaded", 38], ["vacancies_opened", 63],
    ].map(([eventType, count]) => ({ eventType, count: count * factor })),
    pages: [
      ["intro", 512], ["next", 438], ["third", 176], ["share", 94],
    ].map(([page, count]) => ({ page, count: count * factor })),
    series: [
      { name: "Посещения", data: labels.map((label, index) => ({ x: label, y: visits[index] })) },
      { name: "Переводы", data: labels.map((label, index) => ({ x: label, y: translations[index] })) },
    ],
    meta: { generatedAt: new Date().toISOString(), range: safeRange, mock: true },
  };
}

export function getRangePayload(range) {
  if (range === "all") return {};
  const today = new Date();
  const start = new Date(today);
  if (range === "today") start.setHours(0, 0, 0, 0);
  if (range === "7d") start.setDate(today.getDate() - 6);
  if (range === "30d") start.setDate(today.getDate() - 29);
  const toDate = (date) => date.toISOString().slice(0, 10);
  return { dateFrom: toDate(start), dateTo: toDate(today) };
}

export function normalizeAnalytics(data, range) {
  if (!data) return { summary: {}, events: [], pages: [], series: [], meta: { range } };
  const rawSeries = Array.isArray(data.series) ? data.series : [];
  const chartSeries = rawSeries.length && "date" in rawSeries[0]
    ? [
      { name: "Посещения", data: rawSeries.map((point) => ({ x: point.date, y: point.uniqueUsers })) },
      { name: "Переводы", data: rawSeries.map((point) => ({ x: point.date, y: point.translations })) },
    ]
    : rawSeries;
  return { ...data, series: chartSeries };
}

export function createUtmMock(range = "30d") {
  const safeRange = labelsByRange[range] ? range : "30d";
  const factor = { today: .08, "7d": .28, "30d": 1, all: 3.4 }[safeRange];
  const labels = labelsByRange[safeRange];
  const [traffic, translated] = seriesValues[safeRange];
  const items = [
    ["telegram", "social", "magnit_translator", "post_launch", "—", 812, 963, 526],
    ["vk", "social", "magnit_translator", "video", "—", 694, 841, 433],
    ["yandex", "cpc", "career_brand", "banner_1", "работа магнит", 518, 642, 319],
    ["rabota.magnit.ru", "referral", "translator", "vacancies", "—", 376, 421, 207],
    ["email", "newsletter", "employees", "july_digest", "—", 231, 267, 124],
    ["direct", "none", "—", "—", "—", 117, 157, 75],
  ].map(([source, medium, campaign, content, term, uniqueUsers, sessions, translations]) => ({
    source, medium, campaign, content, term,
    uniqueUsers: Math.max(1, Math.round(uniqueUsers * factor)),
    sessions: Math.max(1, Math.round(sessions * factor)),
    translations: Math.max(1, Math.round(translations * factor)),
    conversion: Number(((translations / uniqueUsers) * 100).toFixed(1)),
  }));

  return {
    summary: {
      campaigns: items.length,
      uniqueUsers: items.reduce((sum, item) => sum + item.uniqueUsers, 0),
      sessions: items.reduce((sum, item) => sum + item.sessions, 0),
      translations: items.reduce((sum, item) => sum + item.translations, 0),
    },
    items,
    series: [
      { name: "Переходы", data: labels.map((label, index) => ({ x: label, y: traffic[index] })) },
      { name: "Переводы", data: labels.map((label, index) => ({ x: label, y: translated[index] })) },
    ],
  };
}
