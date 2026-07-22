import {
  Box,
  Button,
  Flex,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import Card from "components/card/Card";
import MiniStatistics from "components/card/MiniStatistics";
import LineChart from "components/charts/LineChart";
import { postJson } from "api";
import { createAnalyticsMock, getRangePayload, normalizeAnalytics, shouldUseAnalyticsMocks } from "mockData";

const EMPTY = {
  summary: {},
  events: [],
  pages: [],
  series: [],
  meta: {},
};

const EVENT_LABELS = {
  session_start: "Начало сессии",
  session_end: "Завершение сессии",
  visibility_changed: "Изменение видимости страницы",
  navigation: "Переход между страницами",
  page_view: "Просмотр страницы",
  click: "Клик",
  profession_input_changed: "Ввод профессии",
  translation_requested: "Запрос перевода",
  translation_succeeded: "Успешный перевод",
  translation_failed: "Ошибка перевода",
  translation_cancelled: "Отменённый перевод",
  share_opened: "Открыт шеринг",
  share_closed: "Закрыт шеринг",
  share_link_copied: "Ссылка скопирована",
  share_link_copy_failed: "Ошибка копирования ссылки",
  telegram_share_opened: "Переход в Telegram",
  result_download_started: "Начато скачивание",
  result_downloaded: "Скачана картинка",
  result_download_failed: "Ошибка скачивания",
  result_shared: "Результатом поделились",
  result_share_cancelled: "Отменена отправка файла",
  vacancies_opened: "Переход к вакансиям",
  impact_slide_changed: "Смена карточки",
};

const PAGE_LABELS = {
  intro: "Главная",
  next: "Переводчик",
  third: "Присоединиться к команде",
  share: "Шеринг",
};

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
const PERIODS = [["today", "Сегодня"], ["7d", "7 дней"], ["30d", "30 дней"], ["all", "Всё время"]];

export default function AnalyticsPage() {
  const [range, setRange] = useState("7d");
  const [analytics, setAnalytics] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const textColor = useColorModeValue("navy.700", "white");
  const secondaryColor = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    if (shouldUseAnalyticsMocks()) {
      setAnalytics({ ...EMPTY, ...normalizeAnalytics(createAnalyticsMock(range), range) });
      setLoading(false);
      return () => { cancelled = true; };
    }
    postJson("/api/analytics/overview", getRangePayload(range))
      .then((response) => {
        if (!cancelled) setAnalytics({ ...EMPTY, ...normalizeAnalytics(response, range) });
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить статистику");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [range]);

  const chartOptions = useMemo(() => ({
    chart: { toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "Google Sans, sans-serif" },
    colors: ["#E5001C", "#FF8A95"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 3 },
    grid: { borderColor, strokeDashArray: 4 },
    legend: { position: "top", horizontalAlign: "right" },
    xaxis: { type: "category", labels: { style: { colors: secondaryColor } } },
    yaxis: { labels: { style: { colors: secondaryColor } } },
    tooltip: { theme: "light" },
  }), [borderColor, secondaryColor]);

  const cards = useMemo(() => {
    const summary = analytics.summary || {};
    return [
      ["uniqueUsers", "Уникальные пользователи", summary.uniqueUsers],
      ["sessions", "Сессии", summary.sessions],
      ["pageViews", "Просмотры страниц", summary.pageViews],
      ["inputUsers", "Вводили профессию", summary.inputUsers],
      ["translationRequests", "Запросы перевода", summary.translationRequests],
      ["successfulTranslations", "Успешные переводы", summary.successfulTranslations],
      ["shareOpens", "Открыли шеринг", summary.shareOpens],
      ["telegramShares", "Перешли в Telegram", summary.telegramShares],
      ["downloads", "Скачали результат", summary.downloads],
      ["vacanciesClicks", "Перешли к вакансиям", summary.vacanciesClicks],
    ];
  }, [analytics.summary]);

  return (
    <Box pt={{ base: "0", md: "80px" }}>
      <Stack spacing="20px">
        <Flex align="end" justify="flex-end" gap="12px" wrap="wrap">
          <Stack align={{ base: "stretch", sm: "end" }} spacing="6px">
            <Flex gap="8px" wrap="wrap" justify={{ base: "flex-start", sm: "flex-end" }}>
              {PERIODS.map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  borderRadius="10px"
                  colorScheme="brand"
                  variant={range === value ? "solid" : "outline"}
                  onClick={() => setRange(value)}
                >
                  {label}
                </Button>
              ))}
            </Flex>
            <Text color={secondaryColor} fontSize="sm">
              Обновлено: {analytics.meta?.generatedAt ? new Date(analytics.meta.generatedAt).toLocaleString("ru-RU") : "—"}
            </Text>
          </Stack>
        </Flex>

        {error ? <Text color="red.500">{error}</Text> : null}

        <Skeleton isLoaded={!loading}>
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 5 }} gap="16px">
            {cards.map(([key, label, value]) => (
              <MiniStatistics key={key} name={label} value={formatNumber(value)} />
            ))}
          </SimpleGrid>
        </Skeleton>

        <Card p={{ base: "16px", md: "24px" }}>
          <Text color={textColor} fontSize="xl" fontWeight="700" mb="16px">Динамика посещений и переводов</Text>
          <Box h={{ base: "260px", md: "340px" }}>
            <LineChart chartData={analytics.series || []} chartOptions={chartOptions} />
          </Box>
        </Card>

        <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px">
          <Card p="24px">
            <Text color={textColor} fontSize="xl" fontWeight="700" mb="16px">События</Text>
            <Box overflowX="auto">
              <Table variant="simple">
                <Thead><Tr><Th color={secondaryColor}>Действие</Th><Th color={secondaryColor} isNumeric>Количество</Th></Tr></Thead>
                <Tbody>
                  {(analytics.events || []).map((item) => (
                    <Tr key={item.eventType}>
                      <Td borderColor={borderColor}>{EVENT_LABELS[item.eventType] || item.eventType}</Td>
                      <Td borderColor={borderColor} isNumeric fontWeight="700">{formatNumber(item.count)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Card>

          <Card p="24px">
            <Text color={textColor} fontSize="xl" fontWeight="700" mb="16px">Страницы</Text>
            <Box overflowX="auto">
              <Table variant="simple">
                <Thead><Tr><Th color={secondaryColor}>Страница</Th><Th color={secondaryColor} isNumeric>Просмотры</Th></Tr></Thead>
                <Tbody>
                  {(analytics.pages || []).map((item) => (
                    <Tr key={item.page}>
                      <Td borderColor={borderColor}>{PAGE_LABELS[item.page] || item.page}</Td>
                      <Td borderColor={borderColor} isNumeric fontWeight="700">{formatNumber(item.count)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Card>
        </SimpleGrid>
      </Stack>
    </Box>
  );
}
