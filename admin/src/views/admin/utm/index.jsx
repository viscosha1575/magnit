import {
  Box,
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
import BarChart from "components/charts/BarChart";
import PeriodFilter from "components/analytics/PeriodFilter";
import { postJson } from "api";
import { createUtmMock, getRangePayload, shouldUseAnalyticsMocks } from "mockData";

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);

export default function UtmPage() {
  const [range, setRange] = useState("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customRange, setCustomRange] = useState(null);
  const [periodError, setPeriodError] = useState("");
  const [response, setResponse] = useState({ summary: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const textColor = useColorModeValue("navy.700", "white");
  const secondaryColor = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const payload = range === "custom" ? customRange : getRangePayload(range);
    if (range === "custom" && !payload) return () => { cancelled = true; };
    if (shouldUseAnalyticsMocks()) {
      setResponse(createUtmMock(range === "custom" ? "7d" : range));
      setLoading(false);
      return () => { cancelled = true; };
    }
    postJson("/api/analytics/utm", payload)
      .then((data) => {
        if (!cancelled) {
          setResponse({ summary: data?.summary || {}, items: data?.items || [] });
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить UTM-аналитику");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [customRange, range]);

  const applyCustomRange = () => {
    if (!dateFrom || !dateTo) {
      setPeriodError("Укажите обе даты");
      return;
    }
    if (dateFrom > dateTo) {
      setPeriodError("Дата начала не может быть позже даты окончания");
      return;
    }
    setPeriodError("");
    setCustomRange({ dateFrom, dateTo });
    setRange("custom");
  };

  const selectPreset = (value) => {
    setPeriodError("");
    setRange(value);
  };

  const cards = useMemo(() => [
    ["campaigns", "UTM-комбинации", response.summary?.campaigns],
    ["uniqueUsers", "Пользователи", response.summary?.uniqueUsers],
    ["sessions", "Сессии", response.summary?.sessions],
    ["translations", "Переводы", response.summary?.translations],
  ], [response.summary]);

  const chartData = useMemo(() => [
    { name: "Пользователи", data: response.items.map((item) => item.uniqueUsers) },
    { name: "Сессии", data: response.items.map((item) => item.sessions) },
    { name: "Переводы", data: response.items.map((item) => item.translations) },
  ], [response.items]);

  const chartOptions = useMemo(() => ({
    chart: { toolbar: { show: false }, fontFamily: "Google Sans, sans-serif" },
    colors: ["#E5001C", "#FF8A95", "#1A202C"],
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 6, columnWidth: "58%" } },
    grid: { borderColor, strokeDashArray: 4 },
    legend: { position: "top", horizontalAlign: "right" },
    xaxis: {
      categories: response.items.map((item) => item.source),
      labels: { rotate: -25, style: { colors: secondaryColor } },
    },
    yaxis: { labels: { style: { colors: secondaryColor } } },
    tooltip: { theme: "light" },
  }), [borderColor, response.items, secondaryColor]);

  return (
    <Box pt={{ base: "0", md: "80px" }}>
      <Stack spacing="20px">
        <Flex align="end" justify="flex-end" gap="12px" wrap="wrap">
          <PeriodFilter
            range={range}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onPreset={selectPreset}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onApply={applyCustomRange}
            error={periodError}
            secondaryColor={secondaryColor}
          />
        </Flex>

        {error ? <Text color="red.500">{error}</Text> : null}

        <Skeleton isLoaded={!loading}>
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} gap="16px">
            {cards.map(([key, label, value]) => (
              <MiniStatistics key={key} name={label} value={formatNumber(value)} />
            ))}
          </SimpleGrid>
        </Skeleton>

        <Card p={{ base: "16px", md: "24px" }}>
          <Text color={textColor} fontSize="xl" fontWeight="700" mb="16px">Эффективность источников</Text>
          <Box h={{ base: "280px", md: "360px" }}>
            <BarChart chartData={chartData} chartOptions={chartOptions} />
          </Box>
        </Card>

        <Card p={{ base: "16px", md: "24px" }}>
          <Box overflowX="auto">
            <Table variant="simple" minW="980px">
              <Thead>
                <Tr>
                  <Th color={secondaryColor}>Source</Th>
                  <Th color={secondaryColor}>Medium</Th>
                  <Th color={secondaryColor}>Campaign</Th>
                  <Th color={secondaryColor}>Content</Th>
                  <Th color={secondaryColor}>Term</Th>
                  <Th color={secondaryColor} isNumeric>Пользователи</Th>
                  <Th color={secondaryColor} isNumeric>Сессии</Th>
                  <Th color={secondaryColor} isNumeric>Переводы</Th>
                  <Th color={secondaryColor} isNumeric>Конверсия</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(response.items || []).map((item, index) => (
                  <Tr key={`${item.source}-${item.medium}-${item.campaign}-${index}`}>
                    <Td borderColor={borderColor} fontWeight="700">{item.source}</Td>
                    <Td borderColor={borderColor}>{item.medium}</Td>
                    <Td borderColor={borderColor}>{item.campaign}</Td>
                    <Td borderColor={borderColor}>{item.content || "—"}</Td>
                    <Td borderColor={borderColor}>{item.term || "—"}</Td>
                    <Td borderColor={borderColor} isNumeric>{formatNumber(item.uniqueUsers)}</Td>
                    <Td borderColor={borderColor} isNumeric>{formatNumber(item.sessions)}</Td>
                    <Td borderColor={borderColor} isNumeric>{formatNumber(item.translations)}</Td>
                    <Td borderColor={borderColor} isNumeric fontWeight="700">{Number(item.conversion || 0).toLocaleString("ru-RU")}%</Td>
                  </Tr>
                ))}
                {!loading && !(response.items || []).length ? (
                  <Tr><Td colSpan={9} py="40px" textAlign="center" color={secondaryColor}>UTM-данных пока нет</Td></Tr>
                ) : null}
              </Tbody>
            </Table>
          </Box>
        </Card>
      </Stack>
    </Box>
  );
}
