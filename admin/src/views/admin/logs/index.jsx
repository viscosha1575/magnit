import {
  Badge,
  Box,
  Flex,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
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
import { SearchIcon } from "@chakra-ui/icons";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Card from "components/card/Card";
import MiniStatistics from "components/card/MiniStatistics";
import { postJson } from "api";
import { formatDateTimeMsk } from "utils/dateTime";

const ACTION_LABELS = {
  all: "Все действия",
  "found-sneaker": "Найден предмет",
  swipe: "Свайп",
  finish: "Финиш",
  heartbeat: "Heartbeat",
  pause: "Пауза",
  "promo-issued": "Выдача приза",
  start: "Старт",
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTime(value) {
  return formatDateTimeMsk(value);
}

function getPlayerLabel(player) {
  if (!player) {
    return "—";
  }

  return player.displayName || player.username || `Игрок #${player.id}`;
}

function getActionBadgeColor(action) {
  if (action === "promo-issued") {
    return "green";
  }

  if (action === "finish") {
    return "blue";
  }

  if (action === "pause") {
    return "orange";
  }

  if (action === "heartbeat") {
    return "purple";
  }

  return "gray";
}

function formatDetails(details) {
  if (!details || typeof details !== "object") {
    return "—";
  }

  const entries = Object.entries(details);

  if (entries.length === 0) {
    return "—";
  }

  return entries
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

const EMPTY_RESPONSE = {
  items: [],
  actions: [],
  summary: {
    totalLogsCount: 0,
    uniquePlayersCount: 0,
    finishActionsCount: 0,
    prizeActionsCount: 0,
  },
};

export default function LogsPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [actionFilter, setActionFilter] = useState("all");
  const [response, setResponse] = useState(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const filterBg = useColorModeValue("white", "navy.800");
  const filterShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      setLoading(true);
      setError("");

      try {
        const nextResponse = await postJson("/api/logs/list", {
          search: deferredSearch,
          action: actionFilter,
        });

        if (!cancelled) {
          setResponse({
            items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
            actions: Array.isArray(nextResponse?.actions) ? nextResponse.actions : [],
            summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить логи");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [actionFilter, deferredSearch]);

  const statCards = useMemo(() => ([
    {
      key: "totalLogsCount",
      label: "Всего событий",
      value: formatNumber(response.summary?.totalLogsCount ?? 0),
    },
    {
      key: "uniquePlayersCount",
      label: "Уникальных игроков",
      value: formatNumber(response.summary?.uniquePlayersCount ?? 0),
    },
    {
      key: "finishActionsCount",
      label: "Финишей",
      value: formatNumber(response.summary?.finishActionsCount ?? 0),
    },
    {
      key: "prizeActionsCount",
      label: "Выдач приза",
      value: formatNumber(response.summary?.prizeActionsCount ?? 0),
    },
  ]), [response.summary]);

  const actionOptions = useMemo(() => {
    const availableActions = Array.isArray(response.actions) ? response.actions : [];
    return ["all", ...availableActions];
  }, [response.actions]);

  return (
    <Box pt={{ base: "0px", md: "80px", xl: "80px" }}>
      <Stack spacing="20px">
        <Card p="24px">
          <Flex
            w="100%"
            align={{ base: "stretch", lg: "center" }}
            justify="center"
            direction={{ base: "column", lg: "row" }}
            gap="12px"
          >
            <Flex
              w="100%"
              align="stretch"
              justify={{ base: "stretch", lg: "space-between" }}
              gap={{ base: "12px", lg: "20px", xl: "28px" }}
              flexWrap={{ base: "wrap", lg: "nowrap" }}
            >
              <InputGroup flex={{ base: "1 1 100%", lg: "1.4 1 0" }} minW="0">
                <InputLeftElement pointerEvents="none" h="56px" ps="8px">
                  <Icon as={SearchIcon} color="secondaryGray.500" boxSize="16px" />
                </InputLeftElement>
                <Input
                  h="56px"
                  minW="0"
                  bg={filterBg}
                  borderColor="transparent"
                  borderRadius="20px"
                  boxShadow={filterShadow}
                  fontSize="sm"
                  fontWeight="500"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск по игроку, user ID или действию"
                  ps="44px"
                  value={search}
                  _hover={{ borderColor: "transparent" }}
                  _focusVisible={{
                    borderColor: "brand.200",
                    boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                  }}
                />
              </InputGroup>

              <Select
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 240px" }}
                bg={filterBg}
                borderColor="transparent"
                borderRadius="20px"
                boxShadow={filterShadow}
                fontSize="sm"
                fontWeight="600"
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value)}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                {actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {ACTION_LABELS[action] || action}
                  </option>
                ))}
              </Select>
            </Flex>
          </Flex>
        </Card>

        {error ? (
          <Card p="18px">
            <Text color="red.500" fontWeight="700">
              {error}
            </Text>
          </Card>
        ) : null}

        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap="20px">
          {statCards.map((card) => (
            <MiniStatistics
              key={card.key}
              name={card.label}
              value={card.value}
            />
          ))}
        </SimpleGrid>

        <Card p={{ base: "18px", md: "24px" }}>
          <Skeleton isLoaded={!loading}>
            <Box overflowX="auto">
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th color={textColorSecondary}>Время</Th>
                    <Th color={textColorSecondary}>Событие</Th>
                    <Th color={textColorSecondary}>Игрок</Th>
                    <Th color={textColorSecondary}>Сессия</Th>
                    <Th color={textColorSecondary}>Источник</Th>
                    <Th color={textColorSecondary}>Детали</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {response.items.length > 0 ? response.items.map((item) => (
                    <Tr key={item.id}>
                      <Td borderColor={borderColor}>
                        <Text color={textColorSecondary} fontSize="sm">
                          {formatDateTime(item.createdAt)}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge
                          borderRadius="999px"
                          colorScheme={getActionBadgeColor(item.action)}
                          px="10px"
                          py="6px"
                        >
                          {ACTION_LABELS[item.action] || item.action}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Stack spacing="4px">
                          <Text color={textColor} fontSize="sm" fontWeight="700">
                            {getPlayerLabel(item.player)}
                          </Text>
                          <Text color={textColorSecondary} fontSize="xs">
                            {item.player?.username ? `@${item.player.username}` : "—"}
                          </Text>
                        </Stack>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Text color={textColorSecondary} fontSize="sm">
                          {item.gameSessionId || "—"}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge borderRadius="999px" colorScheme="gray" px="10px" py="6px">
                          {item.source || "system"}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Text color={textColorSecondary} fontSize="sm">
                          {formatDetails(item.details)}
                        </Text>
                      </Td>
                    </Tr>
                  )) : (
                    <Tr>
                      <Td borderColor={borderColor} colSpan={6}>
                        <Text color={textColorSecondary} fontSize="sm" py="12px" textAlign="center">
                          Логов по текущему фильтру пока нет.
                        </Text>
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </Box>
          </Skeleton>
        </Card>
      </Stack>
    </Box>
  );
}
