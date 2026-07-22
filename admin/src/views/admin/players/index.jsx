import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
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
  useDisclosure,
  useColorModeValue,
} from "@chakra-ui/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "@chakra-ui/icons";
import Card from "components/card/Card";
import { postJson } from "api";
import { formatDateTimeMsk } from "utils/dateTime";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const EMPTY_PLAYER_DETAILS = {
  player: null,
  stats: {
    totalSessions: 0,
    finishedSessions: 0,
    totalDurationSeconds: 0,
    bestDurationSeconds: 0,
    averageDurationSeconds: 0,
    totalActivityLogs: 0,
    availableAttempts: 0,
    invitedReferralsCount: 0,
    lastSessionAt: null,
  },
  recentSessions: [],
  awardedPrizes: [],
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTime(value) {
  return formatDateTimeMsk(value);
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  if (!safeSeconds) {
    return "0с";
  }

  if (minutes > 0) {
    return `${minutes}м ${restSeconds}с`;
  }

  return `${restSeconds}с`;
}

function getSessionStatusLabel(status) {
  if (status === "active") {
    return "Активна";
  }

  if (status === "paused") {
    return "Пауза";
  }

  if (status === "finished") {
    return "Завершена";
  }

  if (status === "expired") {
    return "Истекла";
  }

  return status || "—";
}

function PlayerStat({ label, value, subtext }) {
  const labelColor = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const valueColor = useColorModeValue("navy.700", "white");

  return (
    <Card p="20px">
      <Text color={labelColor} fontSize="sm" fontWeight="500">
        {label}
      </Text>
      <Text color={valueColor} fontSize="2xl" fontWeight="700" mt="8px">
        {value}
      </Text>
      {subtext ? (
        <Text color={labelColor} fontSize="xs" mt="8px">
          {subtext}
        </Text>
      ) : null}
    </Card>
  );
}

function InfoRow({ label, value }) {
  const labelColor = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const valueColor = useColorModeValue("navy.700", "white");

  return (
    <Box>
      <Text color={labelColor} fontSize="xs" fontWeight="600" mb="4px" textTransform="uppercase">
        {label}
      </Text>
      <Text color={valueColor} fontSize="sm" fontWeight="600">
        {value}
      </Text>
    </Box>
  );
}

export default function PlayersPage() {
  const playerModal = useDisclosure();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const [playersResponse, setPlayersResponse] = useState({
    items: [],
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 1,
    },
  });
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState(EMPTY_PLAYER_DETAILS);
  const [selectedPlayerLogs, setSelectedPlayerLogs] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const filterBg = useColorModeValue("white", "navy.800");
  const filterShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)"
  );
  const iconColor = useColorModeValue("secondaryGray.500", "secondaryGray.400");
  const playerCardHoverBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.05)");
  const playerCardSelectedBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.08)");
  const playerCardSelectedBorder = useColorModeValue("rgba(66, 42, 251, 0.18)", "rgba(255, 255, 255, 0.16)");
  const pageBadgeBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.94)");
  const pageBadgeColor = useColorModeValue("navy.700", "navy.700");
  const pagerButtonBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.94)");
  const pagerButtonColor = useColorModeValue("navy.700", "navy.700");
  const pagerButtonHoverBg = useColorModeValue("secondaryGray.400", "rgba(255, 255, 255, 0.88)");
  const modalBg = useColorModeValue("white", "navy.800");
  const modalBorderColor = useColorModeValue("rgba(224, 229, 242, 0.72)", "rgba(255, 255, 255, 0.08)");
  const modalSubtleBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.05)");
  const modalCloseBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.08)");
  const modalCloseColor = useColorModeValue("navy.700", "white");
  const destructiveBg = useColorModeValue("red.100", "rgba(255, 138, 128, 0.14)");
  const destructiveColor = useColorModeValue("red.600", "rgba(255, 180, 180, 0.96)");

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setLoadingPlayers(true);
      setError("");

      try {
        const response = await postJson("/api/analytics/players", {
          search: deferredSearch,
          page,
          pageSize,
          sortKey,
          sortDirection,
        });

        if (cancelled) {
          return;
        }

        const nextItems = Array.isArray(response?.items) ? response.items : [];
        const nextPagination = response?.pagination || {
          page,
          pageSize,
          totalItems: nextItems.length,
          totalPages: 1,
        };

        setPlayersResponse({
          items: nextItems,
          pagination: nextPagination,
        });

        if (!selectedPlayerId && nextItems[0]?.id) {
          setSelectedPlayerId(nextItems[0].id);
        }

        if (selectedPlayerId && !nextItems.some((player) => player.id === selectedPlayerId)) {
          setSelectedPlayerId(nextItems[0]?.id ?? null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить игроков");
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayers(false);
        }
      }
    }

    void loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, page, pageSize, selectedPlayerId, sortDirection, sortKey]);

  useEffect(() => {
    if (!selectedPlayerId) {
      setSelectedPlayerDetails(EMPTY_PLAYER_DETAILS);
      setSelectedPlayerLogs([]);
      setSessionsExpanded(false);
      setLogsExpanded(false);
      return;
    }

    let cancelled = false;

    async function loadPlayerDetails() {
      setLoadingDetails(true);
      setError("");

      try {
        const [detailsResponse, logsResponse] = await Promise.all([
          postJson("/api/analytics/player", {
            playerId: selectedPlayerId,
          }),
          postJson("/api/logs/user", {
            playerId: selectedPlayerId,
            limit: 50,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setSelectedPlayerDetails({
          player: detailsResponse?.player || null,
          stats: {
            ...EMPTY_PLAYER_DETAILS.stats,
            ...(detailsResponse?.stats || {}),
          },
          recentSessions: Array.isArray(detailsResponse?.recentSessions)
            ? detailsResponse.recentSessions
            : [],
          awardedPrizes: Array.isArray(detailsResponse?.awardedPrizes)
            ? detailsResponse.awardedPrizes
            : [],
        });
        setSelectedPlayerLogs(Array.isArray(logsResponse?.logs) ? logsResponse.logs : []);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить детали игрока");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    }

    void loadPlayerDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedPlayerId]);

  const selectedPlayer = selectedPlayerDetails.player;
  const stats = selectedPlayerDetails.stats;
  const pagination = playersResponse.pagination;

  const statRows = useMemo(() => ([
    {
      key: "totalSessions",
      label: "Всего сессий",
      value: formatNumber(stats.totalSessions),
    },
    {
      key: "finishedSessions",
      label: "Финишей",
      value: formatNumber(stats.finishedSessions),
    },
    {
      key: "bestDurationSeconds",
      label: "Лучшее время",
      value: formatDuration(stats.bestDurationSeconds),
    },
    {
      key: "averageDurationSeconds",
      label: "Среднее время",
      value: formatDuration(stats.averageDurationSeconds),
    },
    {
      key: "totalActivityLogs",
      label: "Игровых логов",
      value: formatNumber(stats.totalActivityLogs),
    },
    {
      key: "availableAttempts",
      label: "Доступно попыток",
      value: formatNumber(stats.availableAttempts),
    },
    {
      key: "invitedReferralsCount",
      label: "Приглашено рефералов",
      value: formatNumber(stats.invitedReferralsCount),
    },
    {
      key: "lastSessionAt",
      label: "Последняя сессия",
      value: formatDateTime(stats.lastSessionAt),
    },
  ]), [stats]);

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((currentValue) => currentValue === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "displayName" ? "asc" : "desc");
  }

  async function handleDeletePlayer() {
    if (!selectedPlayer?.id) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить игрока ${selectedPlayer.displayName || selectedPlayer.username || `#${selectedPlayer.id}`}?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      await postJson("/api/users/delete", {
        playerId: selectedPlayer.id,
      });

      setSuccessMessage("Игрок удален");
      playerModal.onClose();
      setSelectedPlayerId(null);
      setSelectedPlayerDetails(EMPTY_PLAYER_DETAILS);
      setSelectedPlayerLogs([]);
      setSessionsExpanded(false);
      setLogsExpanded(false);
      setPage(1);
    } catch (requestError) {
      setError(requestError.message || "Не удалось удалить игрока");
    }
  }

  function handleOpenPlayer(playerId) {
    setSelectedPlayerId(playerId);
    setSuccessMessage("");
    setSessionsExpanded(false);
    setLogsExpanded(false);
    playerModal.onOpen();
  }

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
              <InputGroup
                flex={{ base: "1 1 100%", lg: "1.7 1 0" }}
                minW="0"
              >
                <InputLeftElement pointerEvents="none" h="56px" ps="8px">
                  <Icon as={SearchIcon} color={iconColor} boxSize="16px" />
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
                  placeholder="Поиск по нику, username, platform, user ID"
                  ps="44px"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  _placeholder={{ color: iconColor }}
                  _hover={{ borderColor: "transparent" }}
                  _focusVisible={{
                    borderColor: "brand.200",
                    boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                  }}
                />
              </InputGroup>
              <Select
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 280px" }}
                bg={filterBg}
                borderColor="transparent"
                borderRadius="20px"
                boxShadow={filterShadow}
                fontSize="sm"
                fontWeight="600"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value) || 25);
                  setPage(1);
                }}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} на странице
                  </option>
                ))}
              </Select>
              <Select
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 320px" }}
                bg={filterBg}
                borderColor="transparent"
                borderRadius="20px"
                boxShadow={filterShadow}
                fontSize="sm"
                fontWeight="600"
                value={sortKey}
                onChange={(event) => {
                  setSortKey(event.target.value);
                  setPage(1);
                }}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                <option value="createdAt">Сначала новые</option>
                <option value="lastSeenAt">По последнему визиту</option>
                <option value="displayName">По имени</option>
                <option value="bestDurationSeconds">По лучшему времени</option>
                <option value="totalSessions">По числу сессий</option>
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

        {successMessage ? (
          <Card p="18px">
            <Text color="green.500" fontWeight="700">
              {successMessage}
            </Text>
          </Card>
        ) : null}

        <Card p="24px">
          <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap="12px" mb="18px">
            <Box>
              <Text color={textColor} fontSize="xl" fontWeight="700">
                База игроков
              </Text>
              <Text color={textColorSecondary} fontSize="sm" mt="4px">
                Всего: {formatNumber(pagination.totalItems)}
              </Text>
            </Box>
            <Badge bg={pageBadgeBg} borderRadius="999px" color={pageBadgeColor} px="12px" py="8px">
              Страница {formatNumber(pagination.page)} из {formatNumber(pagination.totalPages)}
            </Badge>
          </Flex>

          {loadingPlayers ? (
            <Stack spacing="12px">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} h="96px" borderRadius="24px" />
              ))}
            </Stack>
          ) : (
            <>
              <Stack spacing="14px">
                {playersResponse.items.length > 0 ? playersResponse.items.map((player) => (
                  <Card
                    key={player.id}
                    as="button"
                    type="button"
                    p={{ base: "14px", md: "22px" }}
                    textAlign="left"
                    width="100%"
                    onClick={() => handleOpenPlayer(player.id)}
                    transition="transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease"
                    bg={selectedPlayerId === player.id ? playerCardSelectedBg : undefined}
                    border="1px solid"
                    borderColor={selectedPlayerId === player.id ? playerCardSelectedBorder : "transparent"}
                    _hover={{
                      transform: "translateY(-1px)",
                      boxShadow: "0px 20px 40px rgba(112, 144, 176, 0.16)",
                      bg: selectedPlayerId === player.id ? playerCardSelectedBg : playerCardHoverBg,
                    }}
                    _active={{
                      transform: "translateY(0px)",
                    }}
                  >
                    <Flex
                      align={{ base: "start", md: "center" }}
                      direction={{ base: "column", md: "row" }}
                      justify="space-between"
                      gap={{ base: "12px", md: "18px" }}
                    >
                      <Box minW={{ md: "220px", xl: "260px" }} w={{ base: "100%", md: "auto" }}>
                        <Text color={textColor} fontSize={{ base: "lg", md: "2xl" }} fontWeight="700" lineHeight="1.15">
                          {player.displayName || player.username || `Игрок #${player.id}`}
                        </Text>
                        <Text color={textColorSecondary} fontSize={{ base: "xs", md: "sm" }} mt={{ base: "4px", md: "6px" }}>
                          {player.username ? `@${player.username}` : "Без username"}
                        </Text>
                      </Box>

                      <SimpleGrid columns={{ base: 2, md: 4, xl: 6 }} spacing={{ base: "10px", md: "14px" }} flex="1" w="100%">
                        <Box>
                          <Text color={textColorSecondary} fontSize={{ base: "10px", md: "xs" }} fontWeight="600" textTransform="uppercase" mb={{ base: "2px", md: "4px" }}>
                            Платформа
                          </Text>
                          <Text color={textColor} fontSize={{ base: "sm", md: "lg" }} fontWeight="700" lineHeight="1.25">
                            {player.platform || "—"}
                          </Text>
                        </Box>
                        <Box>
                          <Text color={textColorSecondary} fontSize={{ base: "10px", md: "xs" }} fontWeight="600" textTransform="uppercase" mb={{ base: "2px", md: "4px" }}>
                            User ID
                          </Text>
                          <Text color={textColor} fontSize={{ base: "sm", md: "lg" }} fontWeight="700" lineHeight="1.25">
                            {player.platformUserId || player.telegramUserId || "—"}
                          </Text>
                        </Box>
                        <Box>
                          <Text color={textColorSecondary} fontSize={{ base: "10px", md: "xs" }} fontWeight="600" textTransform="uppercase" mb={{ base: "2px", md: "4px" }}>
                            Сессии
                          </Text>
                          <Text color={textColor} fontSize={{ base: "sm", md: "lg" }} fontWeight="700" lineHeight="1.25">
                            {formatNumber(player.totalSessions)}
                          </Text>
                        </Box>
                        <Box>
                          <Text color={textColorSecondary} fontSize={{ base: "10px", md: "xs" }} fontWeight="600" textTransform="uppercase" mb={{ base: "2px", md: "4px" }}>
                            Лучшее время
                          </Text>
                          <Text color={textColor} fontSize={{ base: "sm", md: "lg" }} fontWeight="700" lineHeight="1.25">
                            {formatDuration(player.bestDurationSeconds)}
                          </Text>
                        </Box>
                        <Box gridColumn={{ base: "1 / -1", md: "auto" }}>
                          <Text color={textColorSecondary} fontSize={{ base: "10px", md: "xs" }} fontWeight="600" textTransform="uppercase" mb={{ base: "2px", md: "4px" }}>
                            Последний визит
                          </Text>
                          <Text color={textColor} fontSize={{ base: "sm", md: "lg" }} fontWeight="700" lineHeight="1.25">
                            {formatDateTime(player.lastSeenAt)}
                          </Text>
                        </Box>
                        <Flex align="start" justify="start">
                          <Stack direction="row" spacing={{ base: "6px", md: "8px" }} flexWrap="wrap" justify="start">
                            <Badge colorScheme={player.isOnline ? "green" : "gray"} borderRadius="999px" px={{ base: "8px", md: "10px" }} py={{ base: "4px", md: "6px" }} fontSize={{ base: "10px", md: "xs" }}>
                              {player.isOnline ? "Онлайн" : "Не в сети"}
                            </Badge>
                            {player.completedGame ? (
                              <Badge colorScheme="green" borderRadius="999px" px={{ base: "8px", md: "10px" }} py={{ base: "4px", md: "6px" }} fontSize={{ base: "10px", md: "xs" }}>
                                Финиш
                              </Badge>
                            ) : null}
                          </Stack>
                        </Flex>
                      </SimpleGrid>
                    </Flex>
                  </Card>
                )) : (
                  <Card p="24px">
                    <Text color={textColorSecondary}>Игроки не найдены</Text>
                  </Card>
                )}
              </Stack>

              <Flex justify="space-between" align="center" mt="18px" gap="12px" wrap="wrap">
                <Text color={textColorSecondary} fontSize="sm">
                  Сортировка: {sortDirection === "asc" ? "по возрастанию" : "по убыванию"}
                </Text>
                <HStack spacing="12px">
                  <Button
                    bg={pagerButtonBg}
                    color={pagerButtonColor}
                    borderRadius="14px"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
                    _hover={{ bg: pagerButtonHoverBg }}
                  >
                    Назад
                  </Button>
                  <Button
                    bg={pagerButtonBg}
                    color={pagerButtonColor}
                    borderRadius="14px"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((currentValue) => currentValue + 1)}
                    _hover={{ bg: pagerButtonHoverBg }}
                  >
                    Вперед
                  </Button>
                </HStack>
              </Flex>
            </>
          )}
        </Card>

        <Modal isOpen={playerModal.isOpen} onClose={playerModal.onClose} size="7xl" isCentered scrollBehavior="inside">
          <ModalOverlay bg="rgba(15, 23, 42, 0.38)" backdropFilter="blur(10px)" />
          <ModalContent
            bg={modalBg}
            border="1px solid"
            borderColor={modalBorderColor}
            borderRadius={{ base: "20px", md: "30px" }}
            overflow="hidden"
            mx={{ base: "8px", md: "20px" }}
            mt={{ base: "calc(20px + env(safe-area-inset-top, 0px))", md: "16px" }}
            mb={{ base: "calc(12px + env(safe-area-inset-bottom, 0px))", md: "16px" }}
            maxW={{ base: "calc(100vw - 16px)", md: "calc(100vw - 40px)", xl: "1120px" }}
            maxH={{
              base: "calc(100vh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
              md: "calc(100vh - 32px)"
            }}
          >
            <ModalHeader pt="28px" pb="0px" />
            <ModalCloseButton
              top={{ base: "calc(20px + env(safe-area-inset-top, 0px))", md: "20px" }}
              right={{ base: "calc(20px + env(safe-area-inset-right, 0px))", md: "20px" }}
              zIndex="3"
              borderRadius="999px"
              bg={modalCloseBg}
              color={modalCloseColor}
              boxShadow="0px 8px 24px rgba(15, 23, 42, 0.12)"
              _hover={{ bg: modalSubtleBg }}
            />
            <ModalBody p={{ base: "20px", md: "28px" }} pb={{ base: "24px", md: "28px" }}>
              {!selectedPlayer ? (
                <Text color={textColorSecondary}>Игрок не выбран</Text>
              ) : loadingDetails ? (
                <Stack spacing="12px">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} h="64px" borderRadius="18px" />
                  ))}
                </Stack>
              ) : (
                <Stack spacing="20px">
                  <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap="12px">
                    <Box>
                      <Text color={textColor} fontSize={{ base: "2xl", md: "4xl" }} fontWeight="700">
                        {selectedPlayer.displayName || selectedPlayer.username || `Игрок #${selectedPlayer.id}`}
                      </Text>
                      <Text color={textColorSecondary} fontSize="sm" mt="6px">
                        ID {selectedPlayer.id}
                        {selectedPlayer.username ? ` • @${selectedPlayer.username}` : ""}
                      </Text>
                    </Box>
                    <Button
                      bg={destructiveBg}
                      color={destructiveColor}
                      borderRadius="16px"
                      onClick={handleDeletePlayer}
                      _hover={{ bg: destructiveBg }}
                    >
                      Удалить игрока
                    </Button>
                  </Flex>

                  <HStack spacing="10px" flexWrap="wrap">
                    <Badge colorScheme={selectedPlayer.isOnline ? "green" : "gray"} borderRadius="999px" px="10px" py="6px">
                      {selectedPlayer.isOnline ? "Онлайн" : "Не в сети"}
                    </Badge>
                    <Badge colorScheme={selectedPlayer.subscribedToChannel ? "blue" : "gray"} borderRadius="999px" px="10px" py="6px">
                      {selectedPlayer.subscribedToChannel ? "Подписан на канал" : "Не подписан"}
                    </Badge>
                    <Badge colorScheme={selectedPlayer.completedGame ? "green" : "gray"} borderRadius="999px" px="10px" py="6px">
                      {selectedPlayer.completedGame ? "Завершил игру" : "Не завершил игру"}
                    </Badge>
                    <Badge colorScheme={selectedPlayer.timeExpired ? "orange" : "gray"} borderRadius="999px" px="10px" py="6px">
                      {selectedPlayer.timeExpired ? "Время истекло" : "Без тайм-аута"}
                    </Badge>
                  </HStack>

                  <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="16px">
                    {statRows.map((row) => (
                      <PlayerStat
                        key={row.key}
                        label={row.label}
                        value={row.value}
                        subtext={row.subtext}
                      />
                    ))}
                  </SimpleGrid>

                  <Card p="20px" bg={modalSubtleBg}>
                    <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap="16px">
                      <InfoRow label="Platform" value={selectedPlayer.platform || "—"} />
                      <InfoRow label="User ID" value={selectedPlayer.platformUserId || selectedPlayer.telegramUserId || "—"} />
                      <InfoRow label="Имя" value={selectedPlayer.firstName || "—"} />
                      <InfoRow label="Фамилия" value={selectedPlayer.lastName || "—"} />
                      <InfoRow label="Referral code" value={selectedPlayer.referralCode || "—"} />
                      <InfoRow label="Referral link" value={selectedPlayer.referralLink || "—"} />
                      <InfoRow label="Пришел по referral" value={selectedPlayer.referredByCode || "—"} />
                      <InfoRow label="Есть реферер" value={selectedPlayer.hasReferral ? "Да" : "Нет"} />
                      <InfoRow label="Доступно попыток" value={formatNumber(selectedPlayer.availableAttempts)} />
                      <InfoRow label="Подписан на канал" value={selectedPlayer.subscribedToChannel ? "Да" : "Нет"} />
                      <InfoRow label="Промокод" value={selectedPlayer.promoCode || "—"} />
                      <InfoRow label="Создан" value={formatDateTime(selectedPlayer.createdAt)} />
                      <InfoRow label="Последний визит" value={formatDateTime(selectedPlayer.lastSeenAt)} />
                    </SimpleGrid>
                  </Card>

                  <Card p="20px" bg={modalSubtleBg}>
                    <Text color={textColor} fontSize="lg" fontWeight="700" mb="14px">
                      Приглашенные рефералы
                    </Text>
                    <Text color={textColorSecondary} fontSize="sm" mb="10px">
                      {selectedPlayer.invitedReferralIds?.length
                        ? selectedPlayer.invitedReferralIds.join(", ")
                        : "Пока никого не пригласил"}
                    </Text>
                  </Card>

                  <Card p="20px">
                    <Button
                      variant="unstyled"
                      display="block"
                      w="100%"
                      onClick={() => setSessionsExpanded((current) => !current)}
                    >
                      <Flex align="center" justify="space-between" gap="12px" mb={sessionsExpanded ? "14px" : "0"}>
                        <Text color={textColor} fontSize="lg" fontWeight="700">
                          Последние сессии
                        </Text>
                        <Icon as={sessionsExpanded ? ChevronUpIcon : ChevronDownIcon} color={textColorSecondary} boxSize="24px" />
                      </Flex>
                    </Button>
                    {sessionsExpanded ? (
                      <Box overflowX="auto">
                        <Table variant="simple" minW="620px">
                          <Thead>
                            <Tr>
                              <Th borderColor={borderColor}>ID</Th>
                              <Th borderColor={borderColor}>Статус</Th>
                              <Th borderColor={borderColor}>Найдено пар</Th>
                              <Th borderColor={borderColor}>Осталось времени</Th>
                              <Th borderColor={borderColor}>Старт</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {selectedPlayerDetails.recentSessions.length > 0 ? selectedPlayerDetails.recentSessions.map((session) => (
                              <Tr key={session.id}>
                                <Td borderColor="transparent">{session.id}</Td>
                                <Td borderColor="transparent">
                                  <Badge
                                    colorScheme={session.status === "finished" ? "green" : session.status === "paused" ? "orange" : "blue"}
                                    borderRadius="999px"
                                    px="10px"
                                    py="6px"
                                  >
                                    {getSessionStatusLabel(session.status)}
                                  </Badge>
                                </Td>
                                <Td borderColor="transparent">{formatNumber(session.foundSneakersCount)}</Td>
                                <Td borderColor="transparent">{formatDuration(session.remainingSeconds)}</Td>
                                <Td borderColor="transparent">{formatDateTime(session.startedAt)}</Td>
                              </Tr>
                            )) : (
                              <Tr>
                                <Td borderColor="transparent" colSpan={5} color={textColorSecondary}>
                                  Сессий пока нет
                                </Td>
                              </Tr>
                            )}
                          </Tbody>
                        </Table>
                      </Box>
                    ) : null}
                  </Card>

                  <Card p="20px">
                    <Button
                      variant="unstyled"
                      display="block"
                      w="100%"
                      onClick={() => setLogsExpanded((current) => !current)}
                    >
                      <Flex align="center" justify="space-between" gap="12px" mb={logsExpanded ? "14px" : "0"}>
                        <Text color={textColor} fontSize="lg" fontWeight="700">
                          Игровые логи
                        </Text>
                        <Icon as={logsExpanded ? ChevronUpIcon : ChevronDownIcon} color={textColorSecondary} boxSize="24px" />
                      </Flex>
                    </Button>
                    {logsExpanded ? (
                      <Box overflowX="auto">
                        <Table variant="simple" minW="640px">
                          <Thead>
                            <Tr>
                              <Th borderColor={borderColor}>Время</Th>
                              <Th borderColor={borderColor}>Источник</Th>
                              <Th borderColor={borderColor}>Событие</Th>
                              <Th borderColor={borderColor}>Детали</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {selectedPlayerLogs.length > 0 ? selectedPlayerLogs.map((log) => (
                              <Tr key={log.id}>
                                <Td borderColor="transparent">{formatDateTime(log.createdAt)}</Td>
                                <Td borderColor="transparent">{log.source || "—"}</Td>
                                <Td borderColor="transparent">{log.action || "—"}</Td>
                                <Td borderColor="transparent">
                                  <Text color={textColorSecondary} fontSize="xs" whiteSpace="pre-wrap">
                                    {JSON.stringify(log.details || {}, null, 2)}
                                  </Text>
                                </Td>
                              </Tr>
                            )) : (
                              <Tr>
                                <Td borderColor="transparent" colSpan={4} color={textColorSecondary}>
                                  Игровых логов пока нет
                                </Td>
                              </Tr>
                            )}
                          </Tbody>
                        </Table>
                      </Box>
                    ) : null}
                  </Card>

                  <Card p="20px">
                    <Text color={textColor} fontSize="lg" fontWeight="700" mb="14px">
                      Выданные призы
                    </Text>
                    <Stack spacing="12px">
                      {selectedPlayerDetails.awardedPrizes.length > 0 ? selectedPlayerDetails.awardedPrizes.map((prize) => (
                        <Card key={prize.id} p="14px" bg={modalSubtleBg}>
                          <Flex align={{ base: "start", md: "center" }} gap="14px" direction={{ base: "column", md: "row" }}>
                            <Flex
                              w="64px"
                              h="64px"
                              align="center"
                              justify="center"
                              borderRadius="18px"
                              bg="white"
                              overflow="hidden"
                              flexShrink={0}
                            >
                              {prize.image?.previewUrl ? (
                                <Image
                                  src={prize.image.previewUrl}
                                  alt={prize.title || "Выданный приз"}
                                  w="100%"
                                  h="100%"
                                  objectFit="contain"
                                />
                              ) : (
                                <Text color={textColorSecondary} fontSize="xs">
                                  Нет фото
                                </Text>
                              )}
                            </Flex>
                            <Stack spacing="4px" flex="1" minW="0">
                              <Text color={textColor} fontSize="md" fontWeight="700" noOfLines={2}>
                                {prize.title || "Выданный приз"}
                              </Text>
                              <Text color={textColorSecondary} fontSize="sm">
                                В пуле с: {formatDateTime(prize.availableFrom)}
                              </Text>
                              <Text color={textColorSecondary} fontSize="sm">
                                Получен: {formatDateTime(prize.awardedAt)}
                              </Text>
                              <Text color={textColor} fontSize="sm" fontWeight="700" wordBreak="break-all">
                                {prize.promoCode || "—"}
                              </Text>
                            </Stack>
                          </Flex>
                        </Card>
                      )) : (
                        <Text color={textColorSecondary} fontSize="sm">
                          Выданных призов пока нет
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </Stack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      </Stack>
    </Box>
  );
}
