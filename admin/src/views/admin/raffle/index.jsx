import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
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
import { MdCheckCircle, MdDownload, MdFlag } from "react-icons/md";
import * as XLSX from "xlsx";
import Card from "components/card/Card";
import MiniStatistics from "components/card/MiniStatistics";
import { postJson } from "api";
import { formatNullableText } from "../shared/playerData";

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function getRaffleBadgeProps(raffleWon) {
  if (raffleWon === true) {
    return {
      colorScheme: "green",
      label: "Подтвержден",
    };
  }

  if (raffleWon === false) {
    return {
      colorScheme: "red",
      label: "Без выигрыша",
    };
  }

  return {
    colorScheme: "gray",
    label: "В пуле",
  };
}

function downloadWorkbook(workbook, fileName) {
  XLSX.writeFile(workbook, fileName);
}

const EMPTY_RESPONSE = {
  items: [],
  summary: {
    totalParticipantsCount: 0,
    winnersCount: 0,
    losersCount: 0,
    pendingCount: 0,
  },
};

export default function RafflePage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [response, setResponse] = useState(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [finishingRaffle, setFinishingRaffle] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [winnerPlayerId, setWinnerPlayerId] = useState(null);

  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const filterBg = useColorModeValue("white", "navy.800");
  const filterShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)",
  );

  async function loadRafflePlayers(nextSearch = deferredSearch) {
    const nextResponse = await postJson("/api/raffle/players", {
      search: nextSearch,
    });

    setResponse({
      items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
      summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError("");

      try {
        const nextResponse = await postJson("/api/raffle/players", {
          search: deferredSearch,
        });

        if (!cancelled) {
          setResponse({
            items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
            summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить пул шансов");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch]);

  const statCards = useMemo(() => ([
    {
      key: "totalParticipantsCount",
      label: "В пуле",
      value: formatNumber(response.summary?.totalParticipantsCount ?? 0),
    },
    {
      key: "winnersCount",
      label: "Подтверждено",
      value: formatNumber(response.summary?.winnersCount ?? 0),
    },
    {
      key: "pendingCount",
      label: "Ожидают",
      value: formatNumber(response.summary?.pendingCount ?? 0),
    },
  ]), [response.summary]);

  async function handleWinner(playerId) {
    setWinnerPlayerId(playerId);
    setError("");
    setSuccessMessage("");

    try {
      const nextResponse = await postJson("/api/raffle/winner", { playerId });
      const nextPlayer = nextResponse?.player ?? null;

      setResponse((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === playerId ? { ...item, ...nextPlayer } : item)),
        summary: {
          ...current.summary,
          winnersCount: Math.min(
            Number(current.summary?.totalParticipantsCount ?? 0),
            Number(current.summary?.winnersCount ?? 0) + 1,
          ),
          pendingCount: Math.max(0, Number(current.summary?.pendingCount ?? 0) - 1),
        },
      }));
      setSuccessMessage(`Игрок подтвержден победителем, codeId ${nextPlayer?.codeId ?? ""}`.trim());
    } catch (requestError) {
      setError(requestError.message || "Не удалось подтвердить победителя");
    } finally {
      setWinnerPlayerId(null);
    }
  }

  async function handleFinishRaffle() {
    const confirmed = window.confirm("Закрыть пул и отметить всех оставшихся игроков как невыигравших?");

    if (!confirmed) {
      return;
    }

    setFinishingRaffle(true);
    setError("");
    setSuccessMessage("");

    try {
      const nextResponse = await postJson("/api/raffle/finish", {});
      const updatedCount = Number(nextResponse?.updatedCount ?? 0);

      await loadRafflePlayers();
      setSuccessMessage(`Пул закрыт. Без выигрыша отмечено: ${updatedCount}.`);
    } catch (requestError) {
      setError(requestError.message || "Не удалось закрыть пул");
    } finally {
      setFinishingRaffle(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    setSuccessMessage("");

    try {
      const nextResponse = await postJson("/api/raffle/players", {
        search: "",
        outcome: "won",
      });
      const winners = Array.isArray(nextResponse?.items) ? nextResponse.items : [];

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(
        winners.map((player) => ({
          Platform: player.platform ?? "",
          "User ID": player.platformUserId ?? player.telegramUserId ?? "",
          Username: player.username ? `@${player.username}` : "",
          "Code ID": player.codeId ?? "",
        })),
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, "Winners");
      downloadWorkbook(workbook, "chance-winners.xlsx");
      setSuccessMessage(`Экспортировано победителей: ${winners.length}.`);
    } catch (requestError) {
      setError(requestError.message || "Не удалось экспортировать победителей");
    } finally {
      setExporting(false);
    }
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
              <InputGroup flex={{ base: "1 1 100%", lg: "1.5 1 0" }} minW="0">
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
                  placeholder="Поиск по user ID или username"
                  ps="44px"
                  value={search}
                  _hover={{ borderColor: "transparent" }}
                  _focusVisible={{
                    borderColor: "brand.200",
                    boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                  }}
                />
              </InputGroup>

              <Button
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 230px" }}
                bg="brand.500"
                color="white"
                borderRadius="20px"
                fontSize="sm"
                fontWeight="700"
                isLoading={exporting}
                leftIcon={<Icon as={MdDownload} boxSize="20px" />}
                loadingText="Экспортируем"
                onClick={handleExport}
                _hover={{ bg: "brand.600" }}
              >
                Экспорт победителей
              </Button>

              <Button
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 270px" }}
                bg="red.400"
                color="white"
                borderRadius="20px"
                fontSize="sm"
                fontWeight="700"
                isLoading={finishingRaffle}
                leftIcon={<Icon as={MdFlag} boxSize="20px" />}
                loadingText="Закрываем"
                onClick={handleFinishRaffle}
                _hover={{ bg: "red.500" }}
              >
                Закрыть пул
              </Button>
            </Flex>
          </Flex>
        </Card>

        {error ? (
          <Card p="18px">
            <Text color="red.400" fontSize="sm">
              {error}
            </Text>
          </Card>
        ) : null}

        {successMessage ? (
          <Card p="18px">
            <Text color="green.400" fontSize="sm">
              {successMessage}
            </Text>
          </Card>
        ) : null}

        <SimpleGrid columns={{ base: 1, md: 3 }} gap="20px">
          {statCards.map((item) => (
            <MiniStatistics key={item.key} name={item.label} value={item.value} />
          ))}
        </SimpleGrid>

        <Card p={{ base: "18px", md: "24px" }}>
          <Skeleton isLoaded={!loading}>
            <Box overflowX="auto">
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th color={textColorSecondary}>Platform</Th>
                    <Th color={textColorSecondary}>User ID</Th>
                    <Th color={textColorSecondary}>Username</Th>
                    <Th color={textColorSecondary}>Игрок</Th>
                    <Th color={textColorSecondary}>Статус</Th>
                    <Th color={textColorSecondary}>codeId</Th>
                    <Th color={textColorSecondary}>Действие</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {response.items.length > 0 ? response.items.map((player) => {
                    const badge = getRaffleBadgeProps(player.raffleWon);

                    return (
                      <Tr key={player.id}>
                        <Td borderColor={borderColor}>
                          <Text color={textColor} fontSize="sm" fontWeight="700">
                            {formatNullableText(player.platform)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text color={textColor} fontSize="sm" fontWeight="700">
                            {formatNullableText(player.platformUserId ?? player.telegramUserId)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text color={textColorSecondary} fontSize="sm">
                            {player.username ? `@${player.username}` : "—"}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text color={textColorSecondary} fontSize="sm" fontWeight="600">
                            {formatNullableText(player.displayName)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <HStack spacing="8px">
                            <Badge borderRadius="999px" colorScheme={badge.colorScheme} px="10px" py="6px">
                              {badge.label}
                            </Badge>
                          </HStack>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text color={textColorSecondary} fontSize="sm" fontWeight="600">
                            {formatNullableText(player.codeId)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          {player.raffleWon == null ? (
                            <Button
                              size="sm"
                              bg="brand.500"
                              color="white"
                              borderRadius="14px"
                              fontWeight="700"
                              isLoading={winnerPlayerId === player.id}
                              leftIcon={<Icon as={MdCheckCircle} boxSize="18px" />}
                              loadingText="Подтверждаем"
                              onClick={() => handleWinner(player.id)}
                              _hover={{ bg: "brand.600" }}
                            >
                              Подтвердить
                            </Button>
                          ) : (
                            <Text color={textColorSecondary} fontSize="sm">
                              {player.raffleWon ? "Код выдан" : "Без выигрыша"}
                            </Text>
                          )}
                        </Td>
                      </Tr>
                    );
                  }) : (
                    <Tr>
                      <Td borderColor={borderColor} colSpan={6}>
                        <Text color={textColorSecondary} fontSize="sm" py="12px" textAlign="center">
                          Игроки в пуле не найдены.
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
