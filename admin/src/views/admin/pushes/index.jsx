import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Icon,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
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
import { MdDeleteOutline, MdSend, MdUndo } from "react-icons/md";
import Card from "components/card/Card";
import MiniStatistics from "components/card/MiniStatistics";
import ImageUploader from "components/editor/ImageUploader";
import RichTextEditor from "components/editor/RichTextEditor";
import { postJson } from "api";
import { formatDateTimeMsk, formatTimeMsk } from "utils/dateTime";

const STATUS_OPTIONS = [
  { value: "all", label: "Все статусы" },
  { value: "template", label: "Шаблоны" },
  { value: "scheduled", label: "Запланированные" },
  { value: "sent", label: "Отправленные" },
  { value: "revoked", label: "Отозванные" },
];

const SEGMENT_OPTIONS = [
  { value: "all_users", label: "Все пользователи" },
  { value: "selected_users", label: "Один или несколько пользователей" },
];
const APP_BUTTON_PRESET = {
  text: "Открыть",
  url: "https://max.ru/magnit_lenta_bot?startapp",
};

const EMPTY_RESPONSE = {
  items: [],
  summary: {
    totalCampaignsCount: 0,
    sentCampaignsCount: 0,
    totalRecipientsCount: 0,
    deliveredRecipientsCount: 0,
  },
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTime(value) {
  return formatDateTimeMsk(value);
}

function formatPercent(value, digits = 1) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0%";
  }

  return `${numericValue.toFixed(digits)}%`;
}

function getStatusBadgeProps(status) {
  if (status === "template") {
    return {
      colorScheme: "purple",
      label: "Шаблон",
    };
  }

  if (status === "sent") {
    return {
      colorScheme: "green",
      label: "Отправлен",
    };
  }

  if (status === "revoked") {
    return {
      colorScheme: "orange",
      label: "Отозван",
    };
  }

  if (status === "scheduled") {
    return {
      colorScheme: "orange",
      label: "Запланирован",
    };
  }

  return {
    colorScheme: "gray",
    label: "Черновик",
  };
}

function htmlToPlainText(value) {
  if (!value) {
    return "";
  }

  const normalizedHtml = String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|blockquote|h[1-6])>/gi, "\n\n")
    .replace(/<\/(ul|ol)>/gi, "\n");

  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = normalizedHtml;

  return (tempContainer.textContent || tempContainer.innerText || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasLinkInText(value) {
  return /(https?:\/\/|www\.)[^\s<]+/i.test(String(value || ""));
}

function normalizeActionUrl(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    const url = new URL(trimmedValue);

    if (!/^https?:$/i.test(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function isMiniAppUrl(value) {
  const normalizedUrl = normalizeActionUrl(value);

  if (!normalizedUrl) {
    return false;
  }

  try {
    const url = new URL(normalizedUrl);

    return url.hostname === "max.ru" && url.pathname.replace(/^\/+/, "").length > 0 && url.searchParams.has("startapp");
  } catch {
    return false;
  }
}

function autolinkPreviewHtml(value) {
  const rawHtml = String(value || "").trim();

  if (!rawHtml) {
    return "";
  }

  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    const currentNode = walker.currentNode;

    if (currentNode?.parentElement?.closest("a")) {
      continue;
    }

    if (urlPattern.test(currentNode.textContent || "")) {
      textNodes.push(currentNode);
    }

    urlPattern.lastIndex = 0;
  }

  for (const textNode of textNodes) {
    const source = textNode.textContent || "";
    const replacement = source.replace(urlPattern, (match) => {
      const href = match.startsWith("www.") ? `https://${match}` : match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
    const fragment = document.createRange().createContextualFragment(replacement);
    textNode.parentNode?.replaceChild(fragment, textNode);
    urlPattern.lastIndex = 0;
  }

  return template.innerHTML;
}

export default function PushesPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [response, setResponse] = useState(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [sendingPushAction, setSendingPushAction] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const deferredPlayerSearch = useDeferredValue(playerSearch);
  const [playerOptions, setPlayerOptions] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [preparedTemplateId, setPreparedTemplateId] = useState(null);
  const [testedTemplateFingerprint, setTestedTemplateFingerprint] = useState("");
  const [selectedPushId, setSelectedPushId] = useState(null);
  const [draftForm, setDraftForm] = useState({
    title: "",
    audienceKey: SEGMENT_OPTIONS[0].value,
    html: "",
    image: null,
    selectedUsers: [],
    showLinkPreview: true,
    buttonEnabled: false,
    miniAppButtonEnabled: false,
    buttonText: "",
    buttonUrl: "",
  });

  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const filterBg = useColorModeValue("white", "navy.800");
  const filterShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)",
  );
  const previewBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.03)");
  const previewBorder = useColorModeValue("rgba(224, 229, 242, 0.95)", "rgba(255, 255, 255, 0.08)");
  const previewShellBg = useColorModeValue(
    "linear-gradient(180deg, #f8fbff 0%, #eef3ff 100%)",
    "linear-gradient(180deg, rgba(18, 27, 63, 0.92) 0%, rgba(11, 19, 48, 0.96) 100%)",
  );
  const previewFrameBorder = useColorModeValue("rgba(255, 255, 255, 0.92)", "rgba(255, 255, 255, 0.08)");
  const previewBubbleBg = useColorModeValue(
    "linear-gradient(180deg, #ffffff 0%, #f7f9ff 100%)",
    "linear-gradient(180deg, rgba(31, 45, 98, 0.96) 0%, rgba(23, 35, 82, 0.98) 100%)",
  );
  const previewBubbleBorder = useColorModeValue("rgba(210, 220, 246, 0.8)", "rgba(255, 255, 255, 0.06)");
  const previewMetaColor = useColorModeValue("secondaryGray.600", "whiteAlpha.700");
  const previewCaptionColor = useColorModeValue("secondaryGray.500", "whiteAlpha.600");
  const previewShellShadow = useColorModeValue(
    "0px 22px 40px rgba(115, 132, 180, 0.16)",
    "0px 24px 40px rgba(7, 12, 34, 0.36)",
  );
  const previewBubbleShadow = useColorModeValue(
    "0px 14px 28px rgba(129, 143, 179, 0.14)",
    "0px 18px 30px rgba(5, 10, 26, 0.28)",
  );

  async function loadPushes(nextSearch = deferredSearch, nextStatus = statusFilter) {
    const nextResponse = await postJson("/api/pushes/list", {
      search: nextSearch,
      status: nextStatus,
    });

    setResponse({
      items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
      summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function hydratePushes() {
      setLoading(true);
      setError("");

      try {
        const nextResponse = await postJson("/api/pushes/list", {
          search: deferredSearch,
          status: statusFilter,
        });

        if (!cancelled) {
          setResponse({
            items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
            summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить пуши");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydratePushes();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, statusFilter]);

  const statCards = useMemo(() => ([
    {
      key: "totalCampaignsCount",
      label: "Кампаний",
      value: formatNumber(response.summary?.totalCampaignsCount ?? 0),
    },
    {
      key: "sentCampaignsCount",
      label: "Отправлено",
      value: formatNumber(response.summary?.sentCampaignsCount ?? 0),
    },
    {
      key: "totalRecipientsCount",
      label: "Пользователей в сегментах",
      value: formatNumber(response.summary?.totalRecipientsCount ?? 0),
    },
    {
      key: "deliveredRecipientsCount",
      label: "Доставлено",
      value: formatNumber(response.summary?.deliveredRecipientsCount ?? 0),
    },
  ]), [response.summary]);

  useEffect(() => {
    let cancelled = false;

    async function hydratePlayers() {
      if (draftForm.audienceKey !== "selected_users") {
        setPlayerOptions([]);
        return;
      }

      setLoadingPlayers(true);

      try {
        const nextResponse = await postJson("/api/analytics/players", {
          page: 1,
          pageSize: 8,
          sortKey: "lastSeenAt",
          sortDirection: "desc",
          search: deferredPlayerSearch,
        });

        if (!cancelled) {
          setPlayerOptions(Array.isArray(nextResponse?.items) ? nextResponse.items : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setPlayerOptions([]);
          setError(requestError.message || "Не удалось загрузить пользователей");
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayers(false);
        }
      }
    }

    void hydratePlayers();

    return () => {
      cancelled = true;
    };
  }, [deferredPlayerSearch, draftForm.audienceKey]);

  const selectedAudienceLabel = draftForm.audienceKey === "selected_users"
    ? `${draftForm.selectedUsers.length || 0} ${draftForm.selectedUsers.length === 1 ? "пользователь" : draftForm.selectedUsers.length >= 2 && draftForm.selectedUsers.length <= 4 ? "пользователя" : "пользователей"}`
    : "Все пользователи";
  const draftPreviewText = htmlToPlainText(draftForm.html);
  const previewHtml = autolinkPreviewHtml(draftForm.html);
  const draftHasLink = hasLinkInText(draftForm.html) || hasLinkInText(draftPreviewText);
  const normalizedButtonUrl = normalizeActionUrl(draftForm.buttonUrl);
  const isMiniAppButton = draftForm.buttonEnabled && draftForm.miniAppButtonEnabled && isMiniAppUrl(normalizedButtonUrl);
  const hasInlineButton = draftForm.buttonEnabled
    && String(draftForm.buttonText || "").trim()
    && normalizedButtonUrl;
  const draftFingerprint = JSON.stringify({
    title: draftForm.title.trim(),
    audienceKey: draftForm.audienceKey,
    html: draftForm.html,
    imageUrl: draftForm.image?.previewUrl || null,
    selectedUsers: draftForm.selectedUsers.map((item) => item.id).sort((left, right) => left - right),
    showLinkPreview: isMiniAppButton ? false : (draftHasLink ? draftForm.showLinkPreview : true),
      button: hasInlineButton
      ? {
        text: draftForm.buttonText.trim(),
        url: normalizedButtonUrl,
        type: isMiniAppButton ? "open_app" : "link",
      }
      : null,
  });
  const canCreateDraft = draftForm.title.trim()
    && draftPreviewText
    && (!draftForm.buttonEnabled || hasInlineButton)
    && (draftForm.audienceKey !== "selected_users" || draftForm.selectedUsers.length > 0);
  const canSendLiveFromForm = Boolean(preparedTemplateId) && testedTemplateFingerprint === draftFingerprint;
  const selectedPush = useMemo(
    () => response.items.find((item) => item.id === selectedPushId) || null,
    [response.items, selectedPushId],
  );

  function buildDraftPayload() {
    return {
      title: draftForm.title.trim(),
      html: draftForm.html,
      message: draftPreviewText,
      audienceKey: draftForm.audienceKey,
      audienceLabel: selectedAudienceLabel,
      image: draftForm.image
        ? {
          name: draftForm.image.name || "push-image",
          previewUrl: draftForm.image.previewUrl || "",
        }
        : null,
      button: hasInlineButton
        ? {
          text: draftForm.buttonText.trim(),
          url: normalizedButtonUrl,
          type: isMiniAppButton ? "open_app" : "link",
        }
        : null,
      disableLinkPreview: isMiniAppButton ? true : (draftHasLink ? !draftForm.showLinkPreview : false),
      selectedUsers: draftForm.selectedUsers,
    };
  }

  function applyAppButtonPreset() {
    setDraftForm((current) => ({
      ...current,
      buttonEnabled: true,
      miniAppButtonEnabled: true,
      buttonText: APP_BUTTON_PRESET.text,
      buttonUrl: APP_BUTTON_PRESET.url,
      showLinkPreview: false,
    }));
  }

  function handleAddSelectedUser(player) {
    setDraftForm((current) => {
      if (current.selectedUsers.some((item) => item.id === player.id)) {
        return current;
      }

      return {
        ...current,
        selectedUsers: current.selectedUsers.concat({
          id: player.id,
          displayName: player.displayName,
          platform: player.platform,
          platformUserId: player.platformUserId,
          username: player.username,
          telegramUserId: player.telegramUserId,
        }),
      };
    });
    setPlayerSearch("");
  }

  function handleRemoveSelectedUser(playerId) {
    setDraftForm((current) => ({
      ...current,
      selectedUsers: current.selectedUsers.filter((item) => item.id !== playerId),
    }));
  }

  async function handleSendPush(pushId, mode) {
    if (mode === "live") {
      const confirmed = window.confirm("Подтвердите реальную рассылку. Сообщение уйдёт живым получателям.");

      if (!confirmed) {
        return;
      }
    }

    const actionKey = `${pushId}:${mode}`;
    setSendingPushAction(actionKey);
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/pushes/send", { pushId, mode });
      await loadPushes();
      setSuccessMessage(
        mode === "test"
          ? `Тестовая рассылка для шаблона «${result?.push?.title || "Без названия"}» выполнена.`
          : result?.queued
            ? `Реальная рассылка для шаблона «${result?.push?.title || "Без названия"}» поставлена в очередь.`
            : `Реальная рассылка для шаблона «${result?.push?.title || "Без названия"}» отправлена.`,
      );
    } catch (requestError) {
      setError(requestError.message || "Не удалось отправить пуш");
    } finally {
      setSendingPushAction("");
    }
  }

  async function saveCurrentTemplate({ showSuccessMessage = true } = {}) {
    if (!canCreateDraft) {
      return null;
    }

    setCreatingTemplate(true);
    setError("");
    if (showSuccessMessage) {
      setSuccessMessage("");
    }

    try {
      const result = await postJson("/api/pushes/create", buildDraftPayload());

      await loadPushes();
      setPreparedTemplateId(result?.push?.id || null);
      setTestedTemplateFingerprint("");
      if (showSuccessMessage) {
        setSuccessMessage(`Шаблон «${result?.push?.title || "Без названия"}» сохранён.`);
      }
      return result?.push || null;
    } catch (requestError) {
      setError(requestError.message || "Не удалось сохранить шаблон");
      return null;
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function handleCreateDraft() {
    await saveCurrentTemplate();
  }

  async function handleSendCurrentForm(mode) {
    if (mode === "live") {
      if (!canSendLiveFromForm || !preparedTemplateId) {
        return;
      }

      const confirmed = window.confirm("Подтвердите реальную рассылку. Сообщение уйдёт живым получателям.");

      if (!confirmed) {
        return;
      }

      setSendingPushAction("form:live");
      setError("");
      setSuccessMessage("");

      try {
        const result = await postJson("/api/pushes/send", {
          pushId: preparedTemplateId,
          mode: "live",
        });
        await loadPushes();
        setSuccessMessage(
          result?.queued
            ? `Реальная рассылка для шаблона «${result?.push?.title || "Без названия"}» поставлена в очередь.`
            : `Реальная рассылка для шаблона «${result?.push?.title || "Без названия"}» отправлена.`,
        );
      } catch (requestError) {
        setError(requestError.message || "Не удалось отправить реальную рассылку");
      } finally {
        setSendingPushAction("");
      }

      return;
    }

    const push = await saveCurrentTemplate({ showSuccessMessage: false });

    if (!push?.id) {
      return;
    }

    setSendingPushAction("form:test");
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/pushes/send", {
        pushId: push.id,
        mode: "test",
      });
      await loadPushes();
      setPreparedTemplateId(push.id);
      setTestedTemplateFingerprint(draftFingerprint);
      setSuccessMessage(`Тестовая рассылка для шаблона «${result?.push?.title || "Без названия"}» выполнена.`);
    } catch (requestError) {
      setError(requestError.message || "Не удалось отправить тестовую рассылку");
    } finally {
      setSendingPushAction("");
    }
  }

  async function handleDeletePush(pushId) {
    const confirmed = window.confirm("Удалить этот шаблон рассылки?");

    if (!confirmed) {
      return;
    }

    setSendingPushAction(`${pushId}:delete`);
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/pushes/delete", { pushId });
      await loadPushes();

      if (preparedTemplateId === pushId) {
        setPreparedTemplateId(null);
        setTestedTemplateFingerprint("");
      }

      if (selectedPushId === pushId) {
        setSelectedPushId(null);
      }

      setSuccessMessage(`Шаблон «${result?.title || `#${pushId}`}» удалён.`);
    } catch (requestError) {
      setError(requestError.message || "Не удалось удалить шаблон");
    } finally {
      setSendingPushAction("");
    }
  }

  async function handleRevokePush(pushId) {
    const confirmed = window.confirm("Отозвать эту рассылку у получателей? Будут удалены только сообщения, для которых сохранены messageId.");

    if (!confirmed) {
      return;
    }

    setSendingPushAction(`${pushId}:revoke`);
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/pushes/revoke", { pushId });
      await loadPushes();
      setSuccessMessage(
        result?.queued
          ? `Отзыв рассылки «${result?.title || `#${pushId}`}» поставлен в очередь.`
          : `Отзыв завершён: удалено ${result?.stats?.revokedCount || 0}, ошибок ${result?.stats?.failedCount || 0}.`,
      );
    } catch (requestError) {
      setError(requestError.message || "Не удалось отозвать рассылку");
    } finally {
      setSendingPushAction("");
    }
  }

  function renderPushPreview(push) {
    if (!push) {
      return null;
    }

    const itemPreviewText = htmlToPlainText(push.html || push.message || "");
    const itemPreviewHtml = autolinkPreviewHtml(push.html || "");
    const itemHasLink = hasLinkInText(push.html) || hasLinkInText(itemPreviewText);
    const itemButton = push.button?.text && push.button?.url ? push.button : null;

    return (
      <Box
        borderRadius="28px"
        border="1px solid"
        borderColor={previewFrameBorder}
        bgImage={previewShellBg}
        boxShadow={previewShellShadow}
        overflow="hidden"
        p={{ base: "16px", md: "18px" }}
      >
        <Stack spacing="14px">
          <Flex align="center" justify="space-between" gap="12px">
            <Flex align="center" gap="10px" minW="0">
              <Flex
                boxSize="38px"
                borderRadius="14px"
                align="center"
                justify="center"
                bg="linear-gradient(135deg, #6c63ff 0%, #4f2fff 100%)"
                color="white"
                fontSize="sm"
                fontWeight="800"
                boxShadow="0px 10px 22px rgba(79, 47, 255, 0.28)"
                flexShrink={0}
              >
                OT
              </Flex>
              <Box minW="0">
                <Text color={textColor} fontSize="sm" fontWeight="800" noOfLines={1}>
                  Магнит
                </Text>
                <Text color={previewCaptionColor} fontSize="xs" noOfLines={1}>
                  Реальный вид сообщения в MAX
                </Text>
              </Box>
            </Flex>
            <Text color={previewCaptionColor} fontSize="xs" fontWeight="700" flexShrink={0}>
              {push.sentAt ? formatDateTime(push.sentAt) : "черновик"}
            </Text>
          </Flex>

          <Flex justify="flex-start">
            <Box
              maxW={{ base: "100%", md: "420px" }}
              w="100%"
              borderRadius="22px"
              border="1px solid"
              borderColor={previewBubbleBorder}
              bgImage={previewBubbleBg}
              px={{ base: "14px", md: "16px" }}
              py={{ base: "14px", md: "16px" }}
              boxShadow={previewBubbleShadow}
            >
              <Stack spacing="12px">
                {push.imageUrl ? (
                  <Image
                    src={push.imageUrl}
                    alt={push.title}
                    borderRadius="18px"
                    maxH="280px"
                    objectFit="cover"
                    w="100%"
                  />
                ) : null}

                <Box
                  color={textColor}
                  fontSize="sm"
                  lineHeight="1.75"
                  sx={{
                    "& p": {
                      marginBottom: "0",
                    },
                    "& p + p": {
                      marginTop: "8px",
                    },
                    "& ul, & ol": {
                      paddingLeft: "20px",
                      marginBottom: "0",
                    },
                    "& ul + p, & ol + p, & p + ul, & p + ol": {
                      marginTop: "8px",
                    },
                    "& li + li": {
                      marginTop: "6px",
                    },
                    "& a": {
                      color: "var(--chakra-colors-brand-500)",
                      textDecoration: "underline",
                    },
                    "& strong": {
                      fontWeight: "800",
                    },
                  }}
                  dangerouslySetInnerHTML={{
                    __html: itemPreviewHtml || `<p>${itemPreviewText || "Текст сообщения появится здесь."}</p>`,
                  }}
                />

                {itemButton ? (
                  <Button
                    as="a"
                    href={itemButton.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    display="flex"
                    w="100%"
                    minH="48px"
                    px="18px"
                    bg="brand.500"
                    color="white"
                    borderRadius="14px"
                    fontWeight="700"
                    justifyContent="center"
                    _hover={{ bg: "brand.600", textDecoration: "none" }}
                  >
                    {itemButton.text}
                  </Button>
                ) : null}

                <Flex align="center" justify="space-between" gap="12px" pt="2px">
                  <Text color={previewMetaColor} fontSize="xs" fontWeight="700">
                    {push.imageUrl
                      ? (itemHasLink && push.disableLinkPreview ? "Фото + текст · без превью ссылки" : "Фото + текст")
                      : (itemHasLink && push.disableLinkPreview ? "Только текст · без превью ссылки" : "Только текст")}
                    {itemButton ? " · кнопка" : ""}
                  </Text>
                  <Text color={previewCaptionColor} fontSize="xs" fontWeight="700">
                    {push.sentAt ? formatTimeMsk(push.sentAt) : "14:34"}
                  </Text>
                </Flex>
              </Stack>
            </Box>
          </Flex>
        </Stack>
      </Box>
    );
  }

  return (
    <Box pt={{ base: "0px", md: "80px", xl: "80px" }}>
      <Stack spacing="20px">
        <Card p={{ base: "18px", md: "24px" }}>
          <Stack spacing="20px">
            <Flex
              direction={{ base: "column", lg: "row" }}
              align={{ base: "start", lg: "center" }}
              justify="space-between"
              gap="10px"
            >
              <Box>
                <Text color={textColor} fontSize={{ base: "xl", md: "2xl" }} fontWeight="700">
                  Новая рассылка
                </Text>
                <Text color={textColorSecondary} fontSize="sm" mt="6px">
                  Обычная тестовая рассылка всегда отправляется только на MAX ID 169639251.
                </Text>
              </Box>
              <Flex wrap="wrap" gap="10px" justify={{ base: "stretch", lg: "flex-end" }}>
                <Button
                  variant="outline"
                  borderRadius="16px"
                  fontWeight="700"
                  isLoading={sendingPushAction === "form:test"}
                  loadingText="Шлём тест"
                  onClick={() => handleSendCurrentForm("test")}
                  isDisabled={!canCreateDraft || creatingTemplate}
                >
                  Тестовая рассылка
                </Button>
                <Button
                  bg="navy.700"
                  color="white"
                  borderRadius="16px"
                  fontWeight="700"
                  isLoading={sendingPushAction === "form:live"}
                  loadingText="Шлём"
                  onClick={() => handleSendCurrentForm("live")}
                  _hover={{ bg: "navy.800" }}
                  isDisabled={!canSendLiveFromForm || creatingTemplate}
                >
                  Реальная рассылка
                </Button>
                <Button
                  bg="brand.500"
                  color="white"
                  borderRadius="16px"
                  fontWeight="700"
                  isLoading={creatingTemplate}
                  loadingText="Сохраняем"
                  onClick={handleCreateDraft}
                  _hover={{ bg: "brand.600" }}
                  isDisabled={!canCreateDraft || sendingPushAction === "form:test" || sendingPushAction === "form:live"}
                >
                  Сохранить как шаблон
                </Button>
              </Flex>
            </Flex>

            <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px">
              <Stack spacing="16px">
                <Box>
                  <Text color={textColor} fontSize="sm" fontWeight="700" mb="8px">
                    Внутренний заголовок
                  </Text>
                  <Input
                    h="56px"
                    bg={filterBg}
                    borderColor={borderColor}
                    borderRadius="18px"
                    fontSize="sm"
                    fontWeight="500"
                    placeholder="Например: Вечерняя волна для MAX"
                    value={draftForm.title}
                    onChange={(event) => {
                      setDraftForm((current) => ({ ...current, title: event.target.value }));
                    }}
                  />
                </Box>

                <Box>
                  <Text color={textColor} fontSize="sm" fontWeight="700" mb="8px">
                    Сегмент
                  </Text>
                  <Select
                    h="56px"
                    bg={filterBg}
                    borderColor={borderColor}
                    borderRadius="18px"
                    fontSize="sm"
                    fontWeight="600"
                    value={draftForm.audienceKey}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setDraftForm((current) => ({
                        ...current,
                        audienceKey: nextValue,
                        selectedUsers: nextValue === "selected_users" ? current.selectedUsers : [],
                      }));
                    }}
                  >
                    {SEGMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Box>

                {draftForm.audienceKey === "selected_users" ? (
                  <Box>
                    <Text color={textColor} fontSize="sm" fontWeight="700" mb="8px">
                      Получатели
                    </Text>
                    <Stack spacing="12px">
                        <Input
                          h="56px"
                          bg={filterBg}
                          borderColor={borderColor}
                          borderRadius="18px"
                          fontSize="sm"
                          fontWeight="500"
                          placeholder="Найти по имени, username или user ID"
                          value={playerSearch}
                          onChange={(event) => setPlayerSearch(event.target.value)}
                        />

                      {draftForm.selectedUsers.length > 0 ? (
                        <Flex wrap="wrap" gap="8px">
                          {draftForm.selectedUsers.map((user) => (
                            <Button
                              key={user.id}
                              size="sm"
                              borderRadius="999px"
                              bg="purple.50"
                              color="purple.600"
                              onClick={() => handleRemoveSelectedUser(user.id)}
                              _hover={{ bg: "purple.100" }}
                            >
                              {user.displayName || user.username || `Игрок #${user.id}`} ×
                            </Button>
                          ))}
                        </Flex>
                      ) : (
                        <Text color={textColorSecondary} fontSize="sm">
                          Выберите одного или нескольких пользователей для адресной рассылки.
                        </Text>
                      )}

                      <Box
                        border="1px solid"
                        borderColor={borderColor}
                        borderRadius="18px"
                        bg={filterBg}
                        p="12px"
                      >
                        <Text color={textColorSecondary} fontSize="xs" fontWeight="700" mb="10px" textTransform="uppercase">
                          {loadingPlayers ? "Ищем пользователей…" : "Результаты поиска"}
                        </Text>
                        <Stack spacing="8px">
                          {playerOptions
                            .filter((player) => !draftForm.selectedUsers.some((user) => user.id === player.id))
                            .map((player) => (
                              <Flex
                                key={player.id}
                                align="center"
                                justify="space-between"
                                gap="12px"
                                borderRadius="14px"
                                bg={previewBg}
                                px="12px"
                                py="10px"
                              >
                                <Box minW="0">
                                  <Text color={textColor} fontSize="sm" fontWeight="700" noOfLines={1}>
                                    {player.displayName || player.username || `Игрок #${player.id}`}
                                  </Text>
                                  <Text color={textColorSecondary} fontSize="xs" noOfLines={1}>
                                    @{player.username || "без username"} · {(player.platform || "telegram").toUpperCase()} ID {player.platformUserId || player.telegramUserId || player.id}
                                  </Text>
                                </Box>
                                <Button
                                  size="sm"
                                  borderRadius="12px"
                                  variant="outline"
                                  onClick={() => handleAddSelectedUser(player)}
                                >
                                  Добавить
                                </Button>
                              </Flex>
                            ))}

                          {!loadingPlayers && playerOptions.filter((player) => !draftForm.selectedUsers.some((user) => user.id === player.id)).length === 0 ? (
                            <Text color={textColorSecondary} fontSize="sm">
                              По текущему запросу никого не нашли.
                            </Text>
                          ) : null}
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                ) : null}

                <Box>
                  <Text color={textColor} fontSize="sm" fontWeight="700" mb="8px">
                    Текст сообщения
                  </Text>
                  <RichTextEditor
                    value={draftForm.html}
                    onChange={(nextValue) => {
                      setDraftForm((current) => ({ ...current, html: nextValue }));
                    }}
                    placeholder="Наберите текст, добавьте ссылку, список или акцентный фрагмент…"
                  />
                </Box>

                {draftHasLink ? (
                  <Box
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="18px"
                    bg={filterBg}
                    p="14px 16px"
                  >
                    <Checkbox
                      colorScheme="purple"
                      isDisabled={draftForm.miniAppButtonEnabled}
                      isChecked={draftForm.showLinkPreview}
                      onChange={(event) => {
                        setDraftForm((current) => ({
                          ...current,
                          showLinkPreview: event.target.checked,
                        }));
                      }}
                    >
                      <Text as="span" color={textColor} fontSize="sm" fontWeight="600">
                        Показывать превью ссылки
                      </Text>
                    </Checkbox>
                    <Text color={textColorSecondary} fontSize="xs" mt="8px">
                      {draftForm.miniAppButtonEnabled
                        ? "Для кнопки мини-приложения превью ссылки выключается автоматически."
                        : "Если выключить опцию, отправим сообщение в MAX с disable_link_preview=true."}
                    </Text>
                  </Box>
                ) : null}

                <Box
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="18px"
                  bg={filterBg}
                  p="14px 16px"
                >
                  <Flex
                    wrap="wrap"
                    align="center"
                    columnGap="24px"
                    rowGap="12px"
                  >
                    <Checkbox
                      colorScheme="purple"
                      isChecked={draftForm.buttonEnabled}
                      onChange={(event) => {
                        setDraftForm((current) => ({
                          ...current,
                          buttonEnabled: event.target.checked,
                          miniAppButtonEnabled: event.target.checked ? current.miniAppButtonEnabled : false,
                        }));
                      }}
                    >
                      <Text as="span" color={textColor} fontSize="sm" fontWeight="600">
                        Кнопка под сообщением
                      </Text>
                    </Checkbox>
                    <Checkbox
                      colorScheme="purple"
                      isChecked={draftForm.miniAppButtonEnabled}
                      onChange={(event) => {
                        if (event.target.checked) {
                          applyAppButtonPreset();
                          return;
                        }

                        setDraftForm((current) => ({
                          ...current,
                          miniAppButtonEnabled: false,
                        }));
                      }}
                    >
                      <Text as="span" color={textColor} fontSize="sm" fontWeight="600">
                        Кнопка Открыть с приложением
                      </Text>
                    </Checkbox>
                  </Flex>
                  {draftForm.miniAppButtonEnabled ? (
                    <Text color={textColorSecondary} fontSize="xs" mt="8px">
                      Для этой кнопки отправим mini app как `open_app` и выключим превью ссылки.
                    </Text>
                  ) : null}

                  {draftForm.buttonEnabled ? (
                    <Stack spacing="12px" mt="14px">
                      <Box>
                        <Text color={textColor} fontSize="xs" fontWeight="700" mb="6px" textTransform="uppercase">
                          Название кнопки
                        </Text>
                        <Input
                          h="48px"
                          bg={filterBg}
                          borderColor={borderColor}
                          borderRadius="16px"
                          fontSize="sm"
                          fontWeight="500"
                          placeholder="Например: Открыть сайт"
                          value={draftForm.buttonText}
                          isDisabled={draftForm.miniAppButtonEnabled}
                          onChange={(event) => {
                            setDraftForm((current) => ({ ...current, buttonText: event.target.value }));
                          }}
                        />
                      </Box>

                      <Box>
                        <Text color={textColor} fontSize="xs" fontWeight="700" mb="6px" textTransform="uppercase">
                          Ссылка в кнопке
                        </Text>
                        <Input
                          h="48px"
                          bg={filterBg}
                          borderColor={borderColor}
                          borderRadius="16px"
                          fontSize="sm"
                          fontWeight="500"
                          placeholder="https://example.com"
                          value={draftForm.buttonUrl}
                          isDisabled={draftForm.miniAppButtonEnabled}
                          onChange={(event) => {
                            setDraftForm((current) => ({ ...current, buttonUrl: event.target.value }));
                          }}
                        />
                        <Text color={textColorSecondary} fontSize="xs" mt="8px">
                          {draftForm.miniAppButtonEnabled
                            ? "Для mini app отправим сообщение в MAX с кнопкой Открыть без превью ссылки."
                            : "Если заполнить оба поля, отправим сообщение в MAX с инлайн-кнопкой-ссылкой."}
                        </Text>
                        {draftForm.buttonEnabled && !hasInlineButton ? (
                          <Text color="orange.400" fontSize="xs" mt="8px">
                            Для кнопки нужны и название, и корректная ссылка с http:// или https://
                          </Text>
                        ) : null}
                      </Box>
                    </Stack>
                  ) : null}
                </Box>

                <Box>
                  <Text color={textColor} fontSize="sm" fontWeight="700" mb="8px">
                    Фото
                  </Text>
                  <ImageUploader
                    value={draftForm.image}
                    onChange={(nextImage) => {
                      setDraftForm((current) => ({ ...current, image: nextImage }));
                    }}
                  />
                </Box>
              </Stack>

              <Box
                border="1px solid"
                borderColor={previewBorder}
                borderRadius="24px"
                bg={previewBg}
                p={{ base: "18px", md: "22px" }}
              >
                <Text color={textColor} fontSize="lg" fontWeight="700" mb="6px">
                  Превью рассылки
                </Text>
                <Text color={textColorSecondary} fontSize="sm" mb="16px">
                  В рассылке пользователю уйдут текст, фото и кнопка, если она включена. Заголовок используется только внутри админки.
                </Text>

                <Stack spacing="14px">
                  <Badge
                    alignSelf="start"
                    borderRadius="999px"
                    colorScheme="purple"
                    px="10px"
                    py="6px"
                  >
                    {selectedAudienceLabel}
                  </Badge>

                  <Box
                    borderRadius="28px"
                    border="1px solid"
                    borderColor={previewFrameBorder}
                    bgImage={previewShellBg}
                    boxShadow={previewShellShadow}
                    overflow="hidden"
                    p={{ base: "16px", md: "18px" }}
                  >
                    <Stack spacing="14px">
                      <Flex align="center" justify="space-between" gap="12px">
                        <Flex align="center" gap="10px" minW="0">
                          <Flex
                            boxSize="38px"
                            borderRadius="14px"
                            align="center"
                            justify="center"
                            bg="linear-gradient(135deg, #6c63ff 0%, #4f2fff 100%)"
                            color="white"
                            fontSize="sm"
                            fontWeight="800"
                            boxShadow="0px 10px 22px rgba(79, 47, 255, 0.28)"
                            flexShrink={0}
                          >
                            OT
                          </Flex>
                          <Box minW="0">
                            <Text color={textColor} fontSize="sm" fontWeight="800" noOfLines={1}>
                              Магнит
                            </Text>
                            <Text color={previewCaptionColor} fontSize="xs" noOfLines={1}>
                              Реальный вид сообщения в MAX
                            </Text>
                          </Box>
                        </Flex>
                        <Text color={previewCaptionColor} fontSize="xs" fontWeight="700" flexShrink={0}>
                          сейчас
                        </Text>
                      </Flex>

                      <Flex justify="flex-start">
                        <Box
                          maxW={{ base: "100%", md: "420px" }}
                          w="100%"
                          borderRadius="22px"
                          border="1px solid"
                          borderColor={previewBubbleBorder}
                          bgImage={previewBubbleBg}
                          px={{ base: "14px", md: "16px" }}
                          py={{ base: "14px", md: "16px" }}
                          boxShadow={previewBubbleShadow}
                        >
                          <Stack spacing="12px">
                            {draftForm.image?.previewUrl ? (
                              <Image
                                src={draftForm.image.previewUrl}
                                alt={draftForm.image.name || "Превью фото"}
                                borderRadius="18px"
                                maxH="280px"
                                objectFit="cover"
                                w="100%"
                              />
                            ) : null}

                            <Box
                              color={textColor}
                              fontSize="sm"
                              lineHeight="1.75"
                              sx={{
                                "& p": {
                                  marginBottom: "0",
                                },
                                "& p + p": {
                                  marginTop: "8px",
                                },
                                "& ul, & ol": {
                                  paddingLeft: "20px",
                                  marginBottom: "0",
                                },
                                "& ul + p, & ol + p, & p + ul, & p + ol": {
                                  marginTop: "8px",
                                },
                                "& li + li": {
                                  marginTop: "6px",
                                },
                                "& a": {
                                  color: "var(--chakra-colors-brand-500)",
                                  textDecoration: "underline",
                                },
                                "& strong": {
                                  fontWeight: "800",
                                },
                              }}
                              dangerouslySetInnerHTML={{
                                __html: previewHtml || "<p>Текст сообщения появится здесь.</p>",
                              }}
                            />

                            {hasInlineButton ? (
                              <Button
                                as="a"
                                href={normalizedButtonUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                display="flex"
                                w="100%"
                                minH="48px"
                                px="18px"
                                bg="brand.500"
                                color="white"
                                borderRadius="14px"
                                fontWeight="700"
                                justifyContent="center"
                                _hover={{ bg: "brand.600", textDecoration: "none" }}
                              >
                                {draftForm.buttonText.trim()}
                              </Button>
                            ) : null}

                            <Flex align="center" justify="space-between" gap="12px" pt="2px">
                              <Text color={previewMetaColor} fontSize="xs" fontWeight="700">
                                {draftForm.image?.previewUrl
                                  ? (draftHasLink && !draftForm.showLinkPreview ? "Фото + текст · без превью ссылки" : "Фото + текст")
                                  : (draftHasLink && !draftForm.showLinkPreview ? "Только текст · без превью ссылки" : "Только текст")}
                                {hasInlineButton ? " · кнопка" : ""}
                              </Text>
                              <Text color={previewCaptionColor} fontSize="xs" fontWeight="700">
                                14:34
                              </Text>
                            </Flex>
                          </Stack>
                        </Box>
                      </Flex>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            </SimpleGrid>
          </Stack>
        </Card>

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
                  placeholder="Поиск по названию, ссылке или получателю"
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
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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

        {successMessage ? (
          <Card p="18px">
            <Text color="green.500" fontWeight="700">
              {successMessage}
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
            <Box overflow="hidden">
              <Table variant="simple" sx={{ tableLayout: "fixed", width: "100%" }}>
                <Thead>
                  <Tr>
                    <Th color={textColorSecondary} w="24%">Заголовок</Th>
                    <Th color={textColorSecondary} w="42%">Доставка</Th>
                    <Th color={textColorSecondary} w="12%">Статус</Th>
                    <Th color={textColorSecondary} w="8%">CTR</Th>
                    <Th color={textColorSecondary} w="14%">Отправлено</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {response.items.length > 0 ? response.items.map((item) => {
                    const badge = getStatusBadgeProps(item.status);
                    const progressValue = item.recipientsCount > 0
                      ? Math.min(100, Math.max(0, (Number(item.deliveredCount || 0) / Number(item.recipientsCount || 1)) * 100))
                      : 0;

                    return (
                      <Tr
                        key={item.id}
                        cursor="pointer"
                        onClick={() => setSelectedPushId(item.id)}
                        _hover={{ bg: previewBg }}
                      >
                        <Td borderColor={borderColor} verticalAlign="top" py="22px">
                          <Text color={textColor} fontSize="sm" fontWeight="700" noOfLines={2}>
                            {item.title}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor} verticalAlign="top" py="22px">
                          <Stack spacing="10px">
                            <Text color={textColor} fontSize="sm" fontWeight="700">
                              {formatNumber(item.deliveredCount)} / {formatNumber(item.recipientsCount)}
                            </Text>
                            <Progress
                              value={progressValue}
                              size="sm"
                              w="100%"
                              borderRadius="999px"
                              bg={previewBg}
                              colorScheme={item.status === "revoked" ? "orange" : item.status === "sent" ? "green" : "purple"}
                            />
                            <Text color={textColorSecondary} fontSize="xs" noOfLines={1}>
                              {item.audienceLabel}
                            </Text>
                          </Stack>
                        </Td>
                        <Td borderColor={borderColor} verticalAlign="top" py="22px">
                          <Text color={textColor} fontSize="sm" fontWeight="700">
                            {badge.label}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor} verticalAlign="top" py="22px">
                          <Text color={textColorSecondary} fontSize="sm">
                            {formatPercent(item.ctr)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor} verticalAlign="top" py="22px">
                          <Text color={textColorSecondary} fontSize="sm">
                            {formatDateTime(item.sentAt)}
                          </Text>
                        </Td>
                      </Tr>
                    );
                  }) : (
                    <Tr>
                      <Td borderColor={borderColor} colSpan={5}>
                        <Text color={textColorSecondary} fontSize="sm" py="12px" textAlign="center">
                          Пушей по текущему фильтру пока нет.
                        </Text>
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </Box>
          </Skeleton>
        </Card>

        <Modal isOpen={Boolean(selectedPush)} onClose={() => setSelectedPushId(null)} size="6xl" isCentered>
          <ModalOverlay bg="rgba(15, 23, 61, 0.48)" backdropFilter="blur(6px)" />
          <ModalContent borderRadius="28px" overflow="hidden" mx="16px">
            <ModalHeader borderBottom="1px solid" borderColor={borderColor}>
              <Text color={textColor} fontSize="xl" fontWeight="800" pr="36px">
                {selectedPush?.title || "Рассылка"}
              </Text>
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody p={{ base: "18px", md: "24px" }}>
              {selectedPush ? (
                <SimpleGrid columns={{ base: 1, xl: 2 }} gap="20px">
                  <Stack spacing="16px">
                    <SimpleGrid columns={{ base: 1, md: 2 }} gap="12px">
                      <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p="14px 16px">
                        <Text color={textColorSecondary} fontSize="xs" fontWeight="700" textTransform="uppercase" mb="6px">
                          Статус
                        </Text>
                        <Text color={textColor} fontSize="sm" fontWeight="700">
                          {getStatusBadgeProps(selectedPush.status).label}
                        </Text>
                      </Box>
                      <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p="14px 16px">
                        <Text color={textColorSecondary} fontSize="xs" fontWeight="700" textTransform="uppercase" mb="6px">
                          Сегмент
                        </Text>
                        <Text color={textColor} fontSize="sm" fontWeight="700">
                          {selectedPush.audienceLabel}
                        </Text>
                      </Box>
                      <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p="14px 16px">
                        <Text color={textColorSecondary} fontSize="xs" fontWeight="700" textTransform="uppercase" mb="6px">
                          Отправлено реально
                        </Text>
                        <Text color={textColor} fontSize="sm" fontWeight="700">
                          {formatDateTime(selectedPush.sentAt)}
                        </Text>
                      </Box>
                      <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p="14px 16px">
                        <Text color={textColorSecondary} fontSize="xs" fontWeight="700" textTransform="uppercase" mb="6px">
                          CTR
                        </Text>
                        <Text color={textColor} fontSize="sm" fontWeight="700">
                          {formatPercent(selectedPush.ctr)}
                        </Text>
                      </Box>
                    </SimpleGrid>

                    <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p="16px">
                      <Stack spacing="10px">
                        <Flex align="center" justify="space-between" gap="10px">
                          <Text color={textColor} fontSize="sm" fontWeight="700">
                            Прогресс доставки
                          </Text>
                          <Text color={textColorSecondary} fontSize="sm" fontWeight="700">
                            {formatNumber(selectedPush.deliveredCount)} / {formatNumber(selectedPush.recipientsCount)}
                          </Text>
                        </Flex>
                        <Progress
                          value={selectedPush.recipientsCount > 0 ? (Number(selectedPush.deliveredCount || 0) / Number(selectedPush.recipientsCount || 1)) * 100 : 0}
                          size="sm"
                          w="100%"
                          borderRadius="999px"
                          bg={previewBg}
                          colorScheme={selectedPush.status === "revoked" ? "orange" : selectedPush.status === "sent" ? "green" : "purple"}
                        />
                      </Stack>
                    </Box>

                    <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p="16px">
                      <Stack spacing="10px">
                        <Text color={textColorSecondary} fontSize="xs" fontWeight="700" textTransform="uppercase">
                          Подробности
                        </Text>
                        <Text color={textColor} fontSize="sm">
                          Создано: {formatDateTime(selectedPush.createdAt)}
                        </Text>
                        <Text color={textColor} fontSize="sm">
                          Тестовая отправка: {formatDateTime(selectedPush.testSentAt)}
                        </Text>
                        <Text color={textColor} fontSize="sm">
                          Превью ссылки: {selectedPush.disableLinkPreview ? "скрыто" : "показать"}
                        </Text>
                        <Text color={textColor} fontSize="sm">
                          Кнопка: {selectedPush.button?.text ? `${selectedPush.button.text} -> ${selectedPush.button.url}` : "нет"}
                        </Text>
                      </Stack>
                    </Box>
                  </Stack>

                  <Stack spacing="16px">
                    {renderPushPreview(selectedPush)}
                  </Stack>
                </SimpleGrid>
              ) : null}
            </ModalBody>
            <ModalFooter borderTop="1px solid" borderColor={borderColor}>
              {selectedPush ? (
                <Flex w="100%" justify="flex-end" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap="12px">
                  <Flex wrap="wrap" gap="10px" justify={{ base: "stretch", md: "flex-end" }}>
                    {selectedPush.status === "template" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          borderRadius="14px"
                          fontWeight="700"
                          isLoading={sendingPushAction === `${selectedPush.id}:test`}
                          leftIcon={<Icon as={MdSend} boxSize="16px" />}
                          loadingText="Шлём"
                          onClick={() => handleSendPush(selectedPush.id, "test")}
                        >
                          Тестовая рассылка
                        </Button>
                        <Button
                          size="sm"
                          bg="brand.500"
                          color="white"
                          borderRadius="14px"
                          fontWeight="700"
                          isLoading={sendingPushAction === `${selectedPush.id}:live`}
                          leftIcon={<Icon as={MdSend} boxSize="16px" />}
                          loadingText="Шлём"
                          onClick={() => handleSendPush(selectedPush.id, "live")}
                          _hover={{ bg: "brand.600" }}
                          isDisabled={!selectedPush.canSendLive}
                        >
                          Реальная рассылка
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          borderRadius="14px"
                          fontWeight="700"
                          isLoading={sendingPushAction === `${selectedPush.id}:delete`}
                          leftIcon={<Icon as={MdDeleteOutline} boxSize="16px" />}
                          loadingText="Удаляем"
                          onClick={() => handleDeletePush(selectedPush.id)}
                        >
                          Удалить шаблон
                        </Button>
                      </>
                    ) : null}

                    {selectedPush.status === "sent" || selectedPush.status === "revoked" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        borderRadius="14px"
                        fontWeight="700"
                        leftIcon={<Icon as={MdUndo} boxSize="16px" />}
                        isLoading={sendingPushAction === `${selectedPush.id}:revoke`}
                        loadingText="Отзываем"
                        onClick={() => handleRevokePush(selectedPush.id)}
                        isDisabled={!selectedPush.canRevoke}
                      >
                        Отозвать у получателей
                      </Button>
                    ) : null}
                  </Flex>
                </Flex>
              ) : null}
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Stack>
    </Box>
  );
}
