import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
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
  Skeleton,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tooltip,
  Tr,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { MdAdd, MdCardGiftcard, MdDoNotDisturbAlt, MdDragIndicator, MdEdit, MdFlag } from "react-icons/md";
import * as XLSX from "xlsx";
import Card from "components/card/Card";
import ImageUploader from "components/editor/ImageUploader";
import { postJson } from "api";
import { formatDateTimeInputValueMsk, formatDateTimeMskWithoutSeconds } from "utils/dateTime";

const PRIZE_TYPE_OPTIONS = [
  { value: "Приз", label: "Приз" },
  { value: "Не приз", label: "Не приз" },
];

const PRIZE_CATEGORY_OPTIONS = [
  "Отели",
  "Авиа",
  "Баллы Магнит",
  "Мили",
];

const PROMO_CODE_TYPE_OPTIONS = [
  { value: "", label: "Нет типа" },
  { value: "Первый заказ", label: "Первый заказ" },
  { value: "Повторный заказ", label: "Повторный заказ" },
  { value: "Заказ на сумму от", label: "Заказ на сумму от" },
];

const DEFAULT_DRAW_ACTIVE_FROM = "2026-06-10";
const DEFAULT_DRAW_ACTIVE_TO = "2026-09-10";
const PROMO_CODE_SCHEDULE_PAGE_SIZE = 5;
const PROMO_CODE_SCHEDULE_TABS = [
  { id: "available", label: "Доступны" },
  { id: "waiting", label: "В ожидании" },
  { id: "claimed", label: "Выданные" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTimeLabel(value) {
  return formatDateTimeMskWithoutSeconds(value);
}

function formatDateTimeInputValue(value) {
  return formatDateTimeInputValueMsk(value);
}

function splitPromoCodes(rawValue) {
  return String(rawValue || "")
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWorkbookPromoCodes(fileName, rows = []) {
  const normalizedFileName = String(fileName || "").toLowerCase();
  const preferredKeys = ["promo_code", "promocode", "code", "promo code", "промокод"];
  const codes = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const entries = Object.entries(row);

    if (!entries.length) {
      continue;
    }

    let value = "";

    for (const preferredKey of preferredKeys) {
      const matchedEntry = entries.find(([key]) => String(key || "").trim().toLowerCase() === preferredKey);

      if (matchedEntry) {
        value = String(matchedEntry[1] || "").trim();
        break;
      }
    }

    if (!value) {
      const nonNumericEntry = entries.find(([key, entryValue]) => {
        const normalizedKey = String(key || "").trim().toLowerCase();

        if (normalizedKey === "id" || normalizedKey === "__empty") {
          return false;
        }

        return String(entryValue || "").trim();
      });

      value = String(nonNumericEntry?.[1] || "").trim();
    }

    if (!value) {
      continue;
    }

    const looksLikeHeader =
      normalizedFileName.includes(value.toLowerCase())
      || preferredKeys.includes(value.toLowerCase())
      || value.toLowerCase() === "id";

    if (!looksLikeHeader) {
      codes.push(value);
    }
  }

  return Array.from(new Set(codes));
}

function formatPromoReleaseIntervalHint(codesCount, startValue, endValue) {
  const safeCodesCount = Math.max(0, Number(codesCount) || 0);

  if (!safeCodesCount || !startValue || !endValue) {
    return "";
  }

  const startDate = new Date(startValue);
  const endDate = new Date(endValue);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "";
  }

  const durationMs = endDate.getTime() - startDate.getTime();

  if (durationMs < 0) {
    return "Конец периода должен быть позже старта, чтобы распределить коды по времени.";
  }

  if (safeCodesCount === 1 || durationMs === 0) {
    return "Единственный промокод будет доступен сразу в момент старта окна.";
  }

  const intervalMs = durationMs / (safeCodesCount - 1);
  const totalMinutes = Math.max(1, Math.round(intervalMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} ч`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} мин`);
  }

  if (!parts.length) {
    parts.push("1 мин");
  }

  return `Каждый следующий промокод будет доступен каждые ${parts.join(" ")}.`;
}

function normalizeRouletteDescriptions(value) {
  return Array.from(
    new Set(
      Array.isArray(value)
        ? value.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    ),
  );
}

function buildNonPrizeDescriptions(item = {}) {
  const variants = normalizeRouletteDescriptions(item.rouletteDescriptions);
  const fallbackDescription = String(item.rouletteDescription || "").trim();

  if (variants.length) {
    return variants;
  }

  return fallbackDescription ? [fallbackDescription] : [];
}

function ToggleButtonGroup({
  value,
  onChange,
  leftLabel = "Есть",
  rightLabel = "Нет",
}) {
  return (
    <Flex gap="10px" wrap="wrap">
      <Button
        type="button"
        variant={value ? "brand" : "light"}
        minW="92px"
        h="44px"
        fontSize="sm"
        fontWeight="700"
        onClick={() => onChange(true)}
      >
        {leftLabel}
      </Button>
      <Button
        type="button"
        variant={!value ? "brand" : "light"}
        minW="92px"
        h="44px"
        fontSize="sm"
        fontWeight="700"
        onClick={() => onChange(false)}
      >
        {rightLabel}
      </Button>
    </Flex>
  );
}

function FormSection({
  title,
  description,
  children,
  isInvalid = false,
}) {
  const bg = useColorModeValue("white", "navy.900");
  const borderColor = useColorModeValue("rgba(224, 229, 242, 0.95)", "rgba(255, 255, 255, 0.08)");
  const invalidBorderColor = useColorModeValue("red.300", "red.400");
  const titleColor = useColorModeValue("navy.700", "white");
  const descriptionColor = useColorModeValue("secondaryGray.600", "secondaryGray.500");

  return (
    <Box
      bg={bg}
      border="1px solid"
      borderColor={isInvalid ? invalidBorderColor : borderColor}
      boxShadow={isInvalid ? "0 0 0 1px var(--chakra-colors-red-300)" : undefined}
      borderRadius="24px"
      p={{ base: "18px", md: "22px" }}
    >
      <Stack spacing="16px">
        <Box>
          <Text color={titleColor} fontSize="md" fontWeight="700">
            {title}
          </Text>
          {description ? (
            <Text color={descriptionColor} fontSize="sm" mt="4px">
              {description}
            </Text>
          ) : null}
        </Box>
        {children}
      </Stack>
    </Box>
  );
}

const EMPTY_RESPONSE = {
  items: [],
  summary: {
    totalPrizesCount: 0,
    totalUnitsCount: 0,
    totalRemainingCount: 0,
    totalAwardedCount: 0,
  },
  awardedPrizeStats: [],
};

const EMPTY_PROMO_CODE_SCHEDULE_RESPONSE = {
  prize: null,
  summary: {
    availableCount: 0,
    waitingCount: 0,
    claimedCount: 0,
    totalCount: 0,
  },
  availableItems: [],
  waitingItems: [],
  claimedItems: [],
};

function createInitialPrizeForm() {
  return {
    title: "",
    category: "",
    promoCodeType: "",
    type: PRIZE_TYPE_OPTIONS[0].value,
    hasPrizeLimit: true,
    promoCodesFile: null,
    promoCodes: [],
    promoCodeValue: "",
    totalCount: "",
    chanceValue: "1x",
    hasUserLimit: true,
    userLimitCount: "",
    activeFrom: DEFAULT_DRAW_ACTIVE_FROM,
    activeTo: DEFAULT_DRAW_ACTIVE_TO,
    disablePromoCodeReleaseSchedule: false,
    codeReleaseStart: "",
    codeReleaseEnd: "",
    availablePromoCodesCount: 0,
    unavailablePromoCodesCount: 0,
    claimedPromoCodesCount: 0,
    rouletteImage: null,
    myPrizeText: "",
    rouletteDescription: "",
    rouletteDescriptions: [],
    rouletteDescriptionDraft: "",
  };
}

function buildPrizeForm(item = {}) {
  return {
    title: item.title || "",
    category: item.category || "",
    promoCodeType: item.promoCodeType || "",
    type: item.type || PRIZE_TYPE_OPTIONS[0].value,
    hasPrizeLimit: item.hasPrizeLimit ?? true,
    promoCodesFile: item.promoCodesFileName ? { name: item.promoCodesFileName } : null,
    promoCodes: Array.isArray(item.promoCodes) ? item.promoCodes : [],
    promoCodeValue: item.promoCodeValue || "",
    totalCount: String(item.totalCount || ""),
    chanceValue: item.chanceValue || "1x",
    hasUserLimit: item.hasUserLimit ?? true,
    userLimitCount: item.userLimitCount ? String(item.userLimitCount) : "",
    activeFrom: item.activeFrom || "",
    activeTo: item.activeTo || "",
    disablePromoCodeReleaseSchedule: !item.codeReleaseStart && !item.codeReleaseEnd,
    codeReleaseStart: item.codeReleaseStart || "",
    codeReleaseEnd: item.codeReleaseEnd || "",
    availablePromoCodesCount: Number(item.availablePromoCodesCount || 0),
    unavailablePromoCodesCount: Number(item.unavailablePromoCodesCount || 0),
    claimedPromoCodesCount: Number(item.claimedPromoCodesCount || 0),
    rouletteImage: item.rouletteImage || null,
    myPrizeText: item.myPrizeText || "",
    rouletteDescription: item.rouletteDescription || "",
    rouletteDescriptions: buildNonPrizeDescriptions(item),
    rouletteDescriptionDraft: "",
  };
}

function createEmptyValidationState() {
  return {
    fields: {},
    sections: {},
  };
}

function validatePrizeForm(form = {}) {
  const fields = {};
  const sections = {};
  const markField = (field, section, message) => {
    fields[field] = message;
    if (section) {
      sections[section] = true;
    }
  };

  const title = String(form.title || "").trim();
  const type = String(form.type || "").trim();
  const category = String(form.category || "").trim();
  const promoCodeValue = String(form.promoCodeValue || "").trim();
  const activeFrom = String(form.activeFrom || "").trim();
  const activeTo = String(form.activeTo || "").trim();
  const userLimitCount = Math.max(0, Number(form.userLimitCount) || 0);
  const hasPromoCodes = Array.isArray(form.promoCodes) && form.promoCodes.length > 0;
  const hasRouletteImage = Boolean(form.rouletteImage);
  const rouletteDescription = String(form.rouletteDescription || "").trim();
  const rouletteDescriptions = normalizeRouletteDescriptions(form.rouletteDescriptions);

  if (!title) {
    markField("title", "main", "Заполните имя позиции.");
  }

  if (type !== "Не приз" && !category) {
    markField("category", "main", "Выберите категорию.");
  }

  if (type !== "Не приз") {
    if (form.hasPrizeLimit) {
      if (!hasPromoCodes) {
        markField("promoCodes", "limits", "Загрузите промокоды для ограниченного приза.");
      }
    } else if (!promoCodeValue) {
      markField("promoCodeValue", "limits", "Введите промокод.");
    }

    if (form.hasUserLimit && !userLimitCount) {
      markField("userLimitCount", "restrictions", "Укажите лимит на пользователя.");
    }
  }

  if (!activeFrom) {
    markField("activeFrom", type === "Не приз" ? "nonPrize" : "restrictions", "Укажите начало периода.");
  }

  if (!activeTo) {
    markField("activeTo", type === "Не приз" ? "nonPrize" : "restrictions", "Укажите конец периода.");
  }

  if (!hasRouletteImage) {
    markField("rouletteImage", type === "Не приз" ? "nonPrize" : "content", "Загрузите изображение.");
  }

  if (type === "Не приз") {
    if (!rouletteDescriptions.length) {
      markField("rouletteDescription", "nonPrize", "Добавьте хотя бы одно описание.");
    }
  } else if (!rouletteDescription) {
    markField("rouletteDescription", type === "Не приз" ? "nonPrize" : "content", "Добавьте описание.");
  }

  return {
    fields,
    sections,
  };
}

async function parsePromoCodesFromFile(file) {
  if (!file) {
    return [];
  }

  let parsedCodes = [];
  const isPlainTextFile = file.type.startsWith("text/") || /\.(txt|csv)$/i.test(file.name);
  const isExcelFile = /\.(xls|xlsx)$/i.test(file.name);

  if (isPlainTextFile) {
    const rawValue = await file.text();
    parsedCodes = splitPromoCodes(rawValue);
  }

  if (isExcelFile) {
    const fileBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(fileBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

    if (!firstSheet) {
      throw new Error("Не удалось прочитать лист с промокодами");
    }

    const rows = XLSX.utils.sheet_to_json(firstSheet, {
      defval: "",
    });

    parsedCodes = parseWorkbookPromoCodes(file.name, rows);
  }

  return parsedCodes;
}

export default function PromoCodesPage() {
  const choosePrizeTypeModal = useDisclosure();
  const createPrizeModal = useDisclosure();
  const nonPrizeModal = useDisclosure();
  const promoCodesScheduleModal = useDisclosure();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [promoCodeTypeFilter, setPromoCodeTypeFilter] = useState("");
  const [response, setResponse] = useState(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [togglingPrizeId, setTogglingPrizeId] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingPrizeId, setEditingPrizeId] = useState(null);
  const [projectFinished, setProjectFinished] = useState(false);
  const [projectToggleLoading, setProjectToggleLoading] = useState(false);
  const [form, setForm] = useState(createInitialPrizeForm);
  const [formValidation, setFormValidation] = useState(createEmptyValidationState);
  const [promoCodesUploadError, setPromoCodesUploadError] = useState("");
  const [promoCodesPoolAction, setPromoCodesPoolAction] = useState("");
  const [promoCodesScheduleResponse, setPromoCodesScheduleResponse] = useState(EMPTY_PROMO_CODE_SCHEDULE_RESPONSE);
  const [promoCodesScheduleLoading, setPromoCodesScheduleLoading] = useState(false);
  const [promoCodesScheduleError, setPromoCodesScheduleError] = useState("");
  const [promoCodesScheduleTab, setPromoCodesScheduleTab] = useState(PROMO_CODE_SCHEDULE_TABS[0].id);
  const [promoCodesSchedulePage, setPromoCodesSchedulePage] = useState(1);
  const [promoCodesScheduleDrafts, setPromoCodesScheduleDrafts] = useState({});
  const [updatingPromoCodeId, setUpdatingPromoCodeId] = useState(null);
  const [draggedPrizeId, setDraggedPrizeId] = useState(null);
  const [dragOverPrizeId, setDragOverPrizeId] = useState(null);
  const [reorderingPrizeIds, setReorderingPrizeIds] = useState([]);
  const promoCodesInputRef = useRef(null);
  const promoCodesAppendInputRef = useRef(null);

  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const filterBg = useColorModeValue("white", "navy.800");
  const filterShadow = useColorModeValue(
    "0px 16px 36px rgba(112, 144, 176, 0.12)",
    "0px 16px 36px rgba(17, 28, 68, 0.32)",
  );
  const modalBg = useColorModeValue("white", "navy.800");
  const categoryBadgeBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.06)");
  const categoryBadgeColor = useColorModeValue("navy.700", "white");
  const totalValueColor = useColorModeValue("navy.700", "white");
  const remainingValueColor = useColorModeValue("green.500", "green.300");
  const tableCardBorder = useColorModeValue("rgba(224, 229, 242, 0.95)", "rgba(255, 255, 255, 0.08)");
  const promoReleaseIntervalCodesCount = editingPrizeId && form.hasPrizeLimit && !form.promoCodesFile?.size
    ? Number(form.unavailablePromoCodesCount || 0)
    : form.promoCodes.length;
  const promoReleaseIntervalHint = formatPromoReleaseIntervalHint(
    promoReleaseIntervalCodesCount,
    form.codeReleaseStart,
    form.codeReleaseEnd,
  );
  const isPromoCodeReleaseScheduleDisabled = Boolean(form.disablePromoCodeReleaseSchedule);
  const canOpenPromoCodeSchedule = Boolean(editingPrizeId);
  const promoCodesScheduleItems = promoCodesScheduleTab === "available"
    ? promoCodesScheduleResponse.availableItems
    : promoCodesScheduleTab === "waiting"
      ? promoCodesScheduleResponse.waitingItems
      : promoCodesScheduleResponse.claimedItems;
  const promoCodesScheduleTotalPages = Math.max(1, Math.ceil(promoCodesScheduleItems.length / PROMO_CODE_SCHEDULE_PAGE_SIZE));
  const promoCodesScheduleVisibleItems = promoCodesScheduleItems.slice(
    (promoCodesSchedulePage - 1) * PROMO_CODE_SCHEDULE_PAGE_SIZE,
    promoCodesSchedulePage * PROMO_CODE_SCHEDULE_PAGE_SIZE,
  );
  const canReorderPrizes = !deferredSearch && !categoryFilter && !promoCodeTypeFilter;
  function formatPrizeCount(item, value) {
    if (!item?.hasPrizeLimit) {
      return "∞";
    }

    return formatNumber(value);
  }

  function formatAvailableCount(item) {
    if (!item?.hasPrizeLimit) {
      return "∞";
    }

    return formatNumber(item?.availablePromoCodesCount || 0);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPrizes() {
      setLoading(true);
      setError("");

      try {
        const nextResponse = await postJson("/api/prizes/list", {
          search: deferredSearch,
          category: categoryFilter,
          promoCodeType: promoCodeTypeFilter,
        });

        if (!cancelled) {
          setResponse({
            items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
            summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
            awardedPrizeStats: Array.isArray(nextResponse?.awardedPrizeStats) ? nextResponse.awardedPrizeStats : [],
          });
          setProjectFinished(Boolean(nextResponse?.projectFinished));
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить призы");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPrizes();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, categoryFilter, promoCodeTypeFilter]);

  useEffect(() => {
    if (!Object.keys(formValidation.fields).length) {
      return;
    }

    const nextValidation = validatePrizeForm(form);

    if (JSON.stringify(nextValidation) !== JSON.stringify(formValidation)) {
      setFormValidation(nextValidation);
    }
  }, [form, formValidation]);

  useEffect(() => {
    if (promoCodesSchedulePage > promoCodesScheduleTotalPages) {
      setPromoCodesSchedulePage(promoCodesScheduleTotalPages);
    }
  }, [promoCodesSchedulePage, promoCodesScheduleTotalPages]);

  async function reloadPrizes() {
    const nextResponse = await postJson("/api/prizes/list", {
      search: deferredSearch,
      category: categoryFilter,
      promoCodeType: promoCodeTypeFilter,
    });

    setResponse({
      items: Array.isArray(nextResponse?.items) ? nextResponse.items : [],
      summary: nextResponse?.summary ?? EMPTY_RESPONSE.summary,
      awardedPrizeStats: Array.isArray(nextResponse?.awardedPrizeStats) ? nextResponse.awardedPrizeStats : [],
    });
    setProjectFinished(Boolean(nextResponse?.projectFinished));
  }

  async function handleToggleProjectFinished() {
    const nextProjectFinishedState = !projectFinished;
    const confirmed = window.confirm(
      nextProjectFinishedState
        ? "Точно закончить проект? Пользователи перестанут видеть обычное интро и попадут на финальный экран."
        : "Точно продолжить проект? Пользователи снова увидят обычное интро и смогут играть.",
    );

    if (!confirmed) {
      return;
    }

    setProjectToggleLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const nextState = await postJson("/api/project/toggle", {});
      setProjectFinished(Boolean(nextState?.projectFinished));
      await reloadPrizes();
      setSuccessMessage(
        Boolean(nextState?.projectFinished)
          ? "Проект завершен. Пользователи увидят финальный экран."
          : "Проект снова активен. Пользователи увидят обычное интро.",
      );
    } catch (requestError) {
      setError(requestError.message || "Не удалось изменить статус проекта");
    } finally {
      setProjectToggleLoading(false);
    }
  }

  async function handleCreatePrize() {
    const nextValidation = validatePrizeForm(form);

    setFormValidation(nextValidation);

    if (Object.keys(nextValidation.fields).length > 0) {
      setError("Заполните обязательные поля, подсвеченные красным.");
      return;
    }

    setCreating(true);
    setError("");
    setSuccessMessage("");

    try {
      const isNonPrize = form.type === "Не приз";
      const requestPath = editingPrizeId ? "/api/prizes/update" : "/api/prizes/create";
      const result = await postJson(requestPath, {
        id: editingPrizeId,
        title: form.title,
        category: isNonPrize ? "" : form.category,
        promoCodeType: isNonPrize ? "" : form.promoCodeType,
        type: form.type,
        hasPrizeLimit: isNonPrize ? false : form.hasPrizeLimit,
        promoCodesFileName: isNonPrize ? "" : form.promoCodesFile?.name || "",
        promoCodes: isNonPrize ? [] : form.promoCodes,
        promoCodeValue: isNonPrize ? "" : form.promoCodeValue,
        totalCount: isNonPrize ? 0 : form.totalCount,
        chanceValue: form.chanceValue,
        hasUserLimit: isNonPrize ? false : form.hasUserLimit,
        userLimitCount: isNonPrize ? "" : form.userLimitCount,
        activeFrom: form.activeFrom,
        activeTo: form.activeTo,
        codeReleaseStart: isNonPrize || form.disablePromoCodeReleaseSchedule ? "" : form.codeReleaseStart,
        codeReleaseEnd: isNonPrize || form.disablePromoCodeReleaseSchedule ? "" : form.codeReleaseEnd,
        rouletteImage: form.rouletteImage,
        myPrizeText: isNonPrize ? form.title : form.myPrizeText,
        rouletteDescription: isNonPrize
          ? normalizeRouletteDescriptions(form.rouletteDescriptions)[0] || ""
          : form.rouletteDescription,
        rouletteDescriptions: isNonPrize ? normalizeRouletteDescriptions(form.rouletteDescriptions) : [],
      });

      await reloadPrizes();
      setSuccessMessage(
        editingPrizeId
          ? `Позиция «${result?.prize?.title || form.title}» обновлена.`
          : `Позиция «${result?.prize?.title || form.title}» добавлена.`,
      );
      setEditingPrizeId(null);
      setForm(createInitialPrizeForm());
      setFormValidation(createEmptyValidationState());
      setPromoCodesUploadError("");
      createPrizeModal.onClose();
      nonPrizeModal.onClose();
      choosePrizeTypeModal.onClose();
    } catch (requestError) {
      setError(requestError.message || (editingPrizeId ? "Не удалось обновить приз" : "Не удалось добавить приз"));
    } finally {
      setCreating(false);
    }
  }

  function handleOpenCreateModal() {
    setEditingPrizeId(null);
    setForm(createInitialPrizeForm());
    setFormValidation(createEmptyValidationState());
    setPromoCodesUploadError("");
    choosePrizeTypeModal.onOpen();
  }

  function handleSelectPrizeType(nextType) {
    setEditingPrizeId(null);
    setPromoCodesUploadError("");
    setFormValidation(createEmptyValidationState());
    setForm({
      ...createInitialPrizeForm(),
      type: nextType,
      category: nextType === "Приз" ? PRIZE_CATEGORY_OPTIONS[0] : "",
      hasPrizeLimit: nextType === "Приз",
      hasUserLimit: nextType === "Приз",
    });
    choosePrizeTypeModal.onClose();

    if (nextType === "Приз") {
      createPrizeModal.onOpen();
      return;
    }

    nonPrizeModal.onOpen();
  }

  function handleOpenEditModal(item) {
    setEditingPrizeId(item.id);
    setForm(buildPrizeForm(item));
    setFormValidation(createEmptyValidationState());
    setPromoCodesUploadError("");
    setPromoCodesPoolAction("");

    if (item.type === "Не приз") {
      nonPrizeModal.onOpen();
      return;
    }

    createPrizeModal.onOpen();
  }

  async function handlePromoCodesFileChange(filesList) {
    const nextFile = Array.from(filesList || [])[0];

    if (!nextFile) {
      return;
    }

    try {
      const parsedCodes = await parsePromoCodesFromFile(nextFile);

      setPromoCodesUploadError("");
      setForm((current) => ({
        ...current,
        promoCodesFile: {
          name: nextFile.name,
          size: nextFile.size,
          type: nextFile.type,
        },
        promoCodes: parsedCodes,
        totalCount: current.hasPrizeLimit ? String(parsedCodes.length) : current.totalCount,
        availablePromoCodesCount: 0,
        unavailablePromoCodesCount: parsedCodes.length,
        claimedPromoCodesCount: 0,
      }));
    } catch (uploadError) {
      setPromoCodesUploadError(uploadError.message || "Не удалось загрузить список промокодов");
    }
  }

  async function handleClearPrizePromoCodes() {
    if (!editingPrizeId) {
      return;
    }

    const confirmed = window.confirm("Очистить весь пул промокодов у этого приза, включая выданные и невыданные?");

    if (!confirmed) {
      return;
    }

    setPromoCodesPoolAction("clear");
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/prizes/promo-codes/clear", {
        id: editingPrizeId,
      });

      await reloadPrizes();

      if (result?.prize) {
        setForm(buildPrizeForm(result.prize));
      }

      setPromoCodesUploadError("");
      setSuccessMessage("Все промокоды у приза очищены.");
    } catch (requestError) {
      setError(requestError.message || "Не удалось очистить промокоды");
    } finally {
      setPromoCodesPoolAction("");
    }
  }

  async function handleAppendPromoCodesFileChange(filesList) {
    const nextFile = Array.from(filesList || [])[0];

    if (!nextFile || !editingPrizeId) {
      return;
    }

    setPromoCodesPoolAction("append");
    setError("");
    setSuccessMessage("");

    try {
      const parsedCodes = await parsePromoCodesFromFile(nextFile);

      const result = await postJson("/api/prizes/promo-codes/append", {
        id: editingPrizeId,
        promoCodesFileName: nextFile.name,
        promoCodes: parsedCodes,
        codeReleaseStart: form.codeReleaseStart,
        codeReleaseEnd: form.codeReleaseEnd,
      });

      await reloadPrizes();

      if (result?.prize) {
        setForm(buildPrizeForm(result.prize));
      }

      setPromoCodesUploadError("");
      setSuccessMessage(`Промокоды из файла «${nextFile.name}» догружены и пересчитаны по текущему периоду.`);
    } catch (requestError) {
      setError(requestError.message || "Не удалось догрузить промокоды");
    } finally {
      if (promoCodesAppendInputRef.current) {
        promoCodesAppendInputRef.current.value = "";
      }

      setPromoCodesPoolAction("");
    }
  }

  function handleClosePromoCodesScheduleModal() {
    promoCodesScheduleModal.onClose();
    setPromoCodesScheduleError("");
    setPromoCodesScheduleLoading(false);
    setPromoCodesScheduleTab(PROMO_CODE_SCHEDULE_TABS[0].id);
    setPromoCodesSchedulePage(1);
    setPromoCodesScheduleDrafts({});
    setUpdatingPromoCodeId(null);
  }

  async function handleOpenPromoCodesSchedule() {
    if (!editingPrizeId) {
      return;
    }

    setPromoCodesScheduleLoading(true);
    setPromoCodesScheduleError("");
    setPromoCodesScheduleTab(PROMO_CODE_SCHEDULE_TABS[0].id);
    setPromoCodesSchedulePage(1);
    promoCodesScheduleModal.onOpen();

    try {
      const result = await postJson("/api/prizes/promo-codes/schedule", {
        id: editingPrizeId,
      });

      setPromoCodesScheduleResponse({
        prize: result?.prize ?? null,
        summary: result?.summary ?? EMPTY_PROMO_CODE_SCHEDULE_RESPONSE.summary,
        availableItems: Array.isArray(result?.availableItems) ? result.availableItems : [],
        waitingItems: Array.isArray(result?.waitingItems) ? result.waitingItems : [],
        claimedItems: Array.isArray(result?.claimedItems) ? result.claimedItems : [],
      });
      const nextDrafts = {};
      [...(Array.isArray(result?.availableItems) ? result.availableItems : []), ...(Array.isArray(result?.waitingItems) ? result.waitingItems : [])]
        .forEach((item) => {
          nextDrafts[item.id] = formatDateTimeInputValue(item.availableFrom);
        });
      setPromoCodesScheduleDrafts(nextDrafts);
    } catch (requestError) {
      setPromoCodesScheduleResponse(EMPTY_PROMO_CODE_SCHEDULE_RESPONSE);
      setPromoCodesScheduleError(requestError.message || "Не удалось загрузить расписание промокодов");
    } finally {
      setPromoCodesScheduleLoading(false);
    }
  }

  async function handleTogglePrizeEnabled(item, checked) {
    if (!checked) {
      const confirmed = window.confirm(`Действительно хотите выключить приз «${item.title}»?`);

      if (!confirmed) {
        return;
      }
    }

    setTogglingPrizeId(item.id);
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/prizes/toggle-enabled", {
        id: item.id,
        isEnabled: checked,
      });

      await reloadPrizes();
      setSuccessMessage(
        checked
          ? `Позиция «${result?.prize?.title || item.title}» включена.`
          : `Позиция «${result?.prize?.title || item.title}» выключена.`,
      );
    } catch (requestError) {
      setError(requestError.message || "Не удалось изменить статус приза");
    } finally {
      setTogglingPrizeId(null);
    }
  }

  async function handleReorderPrizes(nextIds) {
    if (!Array.isArray(nextIds) || nextIds.length === 0) {
      return;
    }

    setReorderingPrizeIds(nextIds);
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/prizes/reorder", {
        ids: nextIds,
      });

      setResponse((current) => ({
        ...current,
        items: Array.isArray(result?.items) ? result.items : current.items,
      }));
      await reloadPrizes();
      setSuccessMessage("Порядок призов сохранен.");
    } catch (requestError) {
      setError(requestError.message || "Не удалось сохранить порядок призов");
    } finally {
      setDraggedPrizeId(null);
      setDragOverPrizeId(null);
      setReorderingPrizeIds([]);
    }
  }

  function handlePrizeDragStart(prizeId) {
    if (!canReorderPrizes || reorderingPrizeIds.length > 0) {
      return;
    }

    setDraggedPrizeId(prizeId);
  }

  function handlePrizeDrop(targetPrizeId) {
    if (!canReorderPrizes || !draggedPrizeId || draggedPrizeId === targetPrizeId || reorderingPrizeIds.length > 0) {
      setDraggedPrizeId(null);
      setDragOverPrizeId(null);
      return;
    }

    const currentIds = response.items.map((item) => Number(item.id));
    const fromIndex = currentIds.indexOf(Number(draggedPrizeId));
    const toIndex = currentIds.indexOf(Number(targetPrizeId));

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedPrizeId(null);
      setDragOverPrizeId(null);
      return;
    }

    const nextIds = currentIds.slice();
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    void handleReorderPrizes(nextIds);
  }

  async function handleSavePromoCodeAvailability(item) {
    setUpdatingPromoCodeId(item.id);
    setPromoCodesScheduleError("");
    setError("");
    setSuccessMessage("");

    try {
      const result = await postJson("/api/prizes/promo-codes/update-availability", {
        id: editingPrizeId,
        promoCodeId: item.id,
        availableFrom: String(promoCodesScheduleDrafts[item.id] || "").trim(),
      });

      setPromoCodesScheduleResponse({
        prize: result?.prize ?? null,
        summary: result?.summary ?? EMPTY_PROMO_CODE_SCHEDULE_RESPONSE.summary,
        availableItems: Array.isArray(result?.availableItems) ? result.availableItems : [],
        waitingItems: Array.isArray(result?.waitingItems) ? result.waitingItems : [],
        claimedItems: Array.isArray(result?.claimedItems) ? result.claimedItems : [],
      });
      const nextDrafts = {};
      [...(Array.isArray(result?.availableItems) ? result.availableItems : []), ...(Array.isArray(result?.waitingItems) ? result.waitingItems : [])]
        .forEach((scheduleItem) => {
          nextDrafts[scheduleItem.id] = formatDateTimeInputValue(scheduleItem.availableFrom);
        });
      setPromoCodesScheduleDrafts(nextDrafts);
      await reloadPrizes();
      setSuccessMessage(`Время выхода промокода «${item.code}» обновлено.`);
    } catch (requestError) {
      setPromoCodesScheduleError(requestError.message || "Не удалось обновить время выхода промокода");
    } finally {
      setUpdatingPromoCodeId(null);
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
                  placeholder="Поиск по названию, типу или категории"
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
                flex={{ base: "1 1 100%", lg: "0 0 220px" }}
                bg={filterBg}
                borderColor="transparent"
                borderRadius="20px"
                boxShadow={filterShadow}
                fontSize="sm"
                fontWeight="500"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                <option value="">Все категории</option>
                {PRIZE_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
              <Select
                h="56px"
                flex={{ base: "1 1 100%", lg: "0 0 280px" }}
                bg={filterBg}
                borderColor="transparent"
                borderRadius="20px"
                boxShadow={filterShadow}
                fontSize="sm"
                fontWeight="500"
                value={promoCodeTypeFilter}
                onChange={(event) => setPromoCodeTypeFilter(event.target.value)}
                _hover={{ borderColor: "transparent" }}
                _focusVisible={{
                  borderColor: "brand.200",
                  boxShadow: `0 0 0 1px var(--chakra-colors-brand-200), ${filterShadow}`,
                }}
              >
                <option value="">Все типы промокода</option>
                {PROMO_CODE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "__empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Tooltip
                hasArrow
                placement="top"
                label={projectFinished ? "Продолжить проект" : "Флаг финиша"}
              >
                <Button
                  h="56px"
                  w="56px"
                  minW="56px"
                  flex="0 0 56px"
                  variant={projectFinished ? "light" : "solid"}
                  color={projectFinished ? "brand.500" : "white"}
                  bg={projectFinished ? undefined : "red.500"}
                  borderRadius="20px"
                  fontSize="sm"
                  fontWeight="700"
                  aria-label={projectFinished ? "Продолжить проект" : "Флаг финиша"}
                  isLoading={projectToggleLoading}
                  loadingText=""
                  onClick={() => void handleToggleProjectFinished()}
                  _hover={projectFinished ? undefined : { bg: "red.600" }}
                >
                  <Icon as={MdFlag} boxSize="22px" />
                </Button>
              </Tooltip>
              <Tooltip hasArrow placement="top" label="Добавить позицию">
                <Button
                  h="56px"
                  w="56px"
                  minW="56px"
                  flex="0 0 56px"
                  bg="brand.500"
                  color="white"
                  borderRadius="20px"
                  fontSize="sm"
                  fontWeight="700"
                  aria-label="Добавить позицию"
                  onClick={handleOpenCreateModal}
                  _hover={{ bg: "brand.600" }}
                >
                  <Icon as={MdAdd} boxSize="24px" />
                </Button>
              </Tooltip>
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

        <Card p={{ base: "18px", md: "24px" }} border="1px solid" borderColor={tableCardBorder}>
          <Skeleton isLoaded={!loading}>
            <Box overflowX="hidden">
              <Table variant="simple" size="sm" sx={{ tableLayout: "fixed", width: "100%" }}>
                <Thead>
                  <Tr>
                    <Th color={textColorSecondary} w="7%" px="6px" fontSize="10px">Порядок</Th>
                    <Th color={textColorSecondary} w="6%" px="6px" fontSize="10px">Вкл</Th>
                    <Th color={textColorSecondary} w="22%" px="6px" fontSize="10px">Название</Th>
                    <Th color={textColorSecondary} w="6%" px="6px" fontSize="10px">Тип</Th>
                    <Th color={textColorSecondary} w="10%" px="6px" fontSize="10px">Категория</Th>
                    <Th color={textColorSecondary} w="12%" px="6px" fontSize="10px">Тип промокода</Th>
                    <Th color={textColorSecondary} w="8%" px="6px" fontSize="10px">Всего</Th>
                    <Th color={textColorSecondary} w="8%" px="6px" fontSize="10px">Остаток</Th>
                    <Th color={textColorSecondary} w="8%" px="6px" fontSize="10px">Доступно</Th>
                    <Th color={textColorSecondary} w="13%" px="6px" fontSize="10px">Действие</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {response.items.length > 0 ? response.items.map((item) => (
                    <Tr
                      key={item.id}
                      opacity={item.isEnabled ? 1 : 0.56}
                      draggable={canReorderPrizes && reorderingPrizeIds.length === 0}
                      onDragStart={() => handlePrizeDragStart(item.id)}
                      onDragOver={(event) => {
                        if (!canReorderPrizes) {
                          return;
                        }

                        event.preventDefault();
                        setDragOverPrizeId(item.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverPrizeId === item.id) {
                          setDragOverPrizeId(null);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handlePrizeDrop(item.id);
                      }}
                      sx={dragOverPrizeId === item.id ? { bg: "rgba(43, 108, 176, 0.06)" } : undefined}
                    >
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Flex align="center" gap="8px">
                          <Icon as={MdDragIndicator} color={canReorderPrizes ? textColorSecondary : "transparent"} boxSize="16px" />
                          <Text color={textColorSecondary} fontSize="13px" fontWeight="700">
                            {formatNumber(item.sortOrder || 0)}
                          </Text>
                        </Flex>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Checkbox
                          colorScheme="brandScheme"
                          isChecked={Boolean(item.isEnabled)}
                          isDisabled={togglingPrizeId === item.id}
                          onChange={(event) => void handleTogglePrizeEnabled(item, event.target.checked)}
                        />
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Flex align="center" gap="8px" minH="38px">
                          <Flex
                            w="32px"
                            h="32px"
                            align="center"
                            justify="center"
                            borderRadius="10px"
                            bg={categoryBadgeBg}
                            overflow="hidden"
                            flexShrink={0}
                          >
                            {item.rouletteImage?.previewUrl ? (
                              <Image
                                src={item.rouletteImage.previewUrl}
                                alt={item.title || "Превью позиции"}
                                w="100%"
                                h="100%"
                                objectFit="contain"
                              />
                            ) : (
                              <Icon
                                as={item.type === "Приз" ? MdCardGiftcard : MdDoNotDisturbAlt}
                                boxSize="18px"
                                color={textColorSecondary}
                              />
                            )}
                          </Flex>
                          <Stack spacing="4px">
                            <Text color={textColor} fontSize="13px" fontWeight="700" lineHeight="1.3" whiteSpace="pre-line">
                              {item.myPrizeText || item.title}
                            </Text>
                            <Text color={textColorSecondary} fontSize="11px">
                              ID: {item.id}
                            </Text>
                            {item.type === "Приз" && item.hasPrizeLimit ? (
                              <Text color={textColorSecondary} fontSize="11px" lineHeight="1.3">
                                В пуле: {formatNumber(item.availablePromoCodesCount || 0)} | Ждут: {formatNumber(item.unavailablePromoCodesCount || 0)}
                              </Text>
                            ) : null}
                          </Stack>
                        </Flex>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Tooltip label={item.type} hasArrow placement="top">
                          <Flex
                            w="28px"
                            h="28px"
                            align="center"
                            justify="center"
                            borderRadius="9px"
                            bg={item.type === "Приз" ? "brand.50" : categoryBadgeBg}
                            color={item.type === "Приз" ? "brand.500" : textColorSecondary}
                          >
                            <Icon
                              as={item.type === "Приз" ? MdCardGiftcard : MdDoNotDisturbAlt}
                              boxSize="16px"
                            />
                          </Flex>
                        </Tooltip>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        {item.category ? (
                          <Badge
                            bg={categoryBadgeBg}
                            color={categoryBadgeColor}
                            borderRadius="999px"
                            px="7px"
                            py="4px"
                            fontSize="11px"
                            fontWeight="700"
                            whiteSpace="normal"
                          >
                            {item.category}
                          </Badge>
                        ) : (
                          <Text color={textColorSecondary} fontSize="13px" fontWeight="600">
                            —
                          </Text>
                        )}
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Text color={textColor} fontSize="11px" fontWeight="600" whiteSpace="normal" lineHeight="1.3">
                          {item.promoCodeType || "Нет типа"}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Text color={totalValueColor} fontSize="13px" fontWeight="700">
                          {formatPrizeCount(item, item.totalCount)}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Text color={remainingValueColor} fontSize="13px" fontWeight="700">
                          {formatPrizeCount(item, item.remainingCount)}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Text color={remainingValueColor} fontSize="13px" fontWeight="700">
                          {formatAvailableCount(item)}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor} py="12px" px="6px">
                        <Flex gap="10px" wrap="wrap">
                          <Button
                            variant="lightBrand"
                            size="sm"
                            minW="110px"
                            h="34px"
                            leftIcon={<Icon as={MdEdit} boxSize="14px" />}
                            fontSize="11px"
                            fontWeight="700"
                            onClick={() => handleOpenEditModal(item)}
                          >
                            Изменить
                          </Button>
                        </Flex>
                      </Td>
                    </Tr>
                  )) : (
                    <Tr>
                      <Td borderColor={borderColor} colSpan={10}>
                        <Text color={textColorSecondary} fontSize="13px" py="12px" textAlign="center">
                          Призов пока нет.
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

      <Modal isOpen={choosePrizeTypeModal.isOpen} onClose={choosePrizeTypeModal.onClose} isCentered>
        <ModalOverlay bg="rgba(15, 23, 42, 0.45)" />
        <ModalContent bg={modalBg} borderRadius="28px" p="8px" maxW={{ base: "92vw", md: "720px" }} border="1px solid" borderColor={tableCardBorder}>
          <ModalHeader color={textColor} fontSize="2xl" fontWeight="700" textAlign="center" pt="20px">
            Что добавляем?
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="28px">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
              <Button
                variant="brand"
                h="96px"
                borderRadius="28px"
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="700"
                onClick={() => handleSelectPrizeType("Не приз")}
              >
                не приз
              </Button>
              <Button
                variant="brand"
                h="96px"
                borderRadius="28px"
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="700"
                onClick={() => handleSelectPrizeType("Приз")}
              >
                приз
              </Button>
            </SimpleGrid>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={promoCodesScheduleModal.isOpen} onClose={handleClosePromoCodesScheduleModal} isCentered size="4xl" scrollBehavior="inside">
        <ModalOverlay bg="rgba(15, 23, 42, 0.45)" />
        <ModalContent bg={modalBg} borderRadius="24px" p="4px" maxW={{ base: "94vw", xl: "920px" }} border="1px solid" borderColor={tableCardBorder}>
          <ModalHeader color={textColor} fontSize="xl" fontWeight="700">
            {promoCodesScheduleResponse.prize?.title
              ? `Расписание промокодов: ${promoCodesScheduleResponse.prize.title}`
              : "Расписание промокодов"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="24px">
            <Stack spacing="18px">
              <Flex gap="12px" wrap="wrap">
                {PROMO_CODE_SCHEDULE_TABS.map((tab) => {
                  const count = tab.id === "available"
                    ? promoCodesScheduleResponse.summary.availableCount
                    : tab.id === "waiting"
                      ? promoCodesScheduleResponse.summary.waitingCount
                      : promoCodesScheduleResponse.summary.claimedCount;

                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={promoCodesScheduleTab === tab.id ? "brand" : "light"}
                      h="44px"
                      borderRadius="16px"
                      onClick={() => {
                        setPromoCodesScheduleTab(tab.id);
                        setPromoCodesSchedulePage(1);
                      }}
                    >
                      {tab.label}: {formatNumber(count)}
                    </Button>
                  );
                })}
              </Flex>

              <Text color={textColorSecondary} fontSize="sm">
                Всего кодов в расписании: {formatNumber(promoCodesScheduleResponse.summary.totalCount)}
              </Text>

              <Flex justify="space-between" align={{ base: "start", md: "center" }} direction={{ base: "column", md: "row" }} gap="10px">
                <Text color={textColorSecondary} fontSize="sm">
                  Показываем по {PROMO_CODE_SCHEDULE_PAGE_SIZE} промокодов на страницу.
                </Text>
                <Flex gap="8px" align="center">
                  <Button
                    type="button"
                    variant="light"
                    h="38px"
                    minW="84px"
                    isDisabled={promoCodesSchedulePage <= 1}
                    onClick={() => setPromoCodesSchedulePage((current) => Math.max(1, current - 1))}
                  >
                    Назад
                  </Button>
                  <Text color={textColorSecondary} fontSize="sm" minW="96px" textAlign="center">
                    {promoCodesSchedulePage} / {promoCodesScheduleTotalPages}
                  </Text>
                  <Button
                    type="button"
                    variant="light"
                    h="38px"
                    minW="84px"
                    isDisabled={promoCodesSchedulePage >= promoCodesScheduleTotalPages}
                    onClick={() => setPromoCodesSchedulePage((current) => Math.min(promoCodesScheduleTotalPages, current + 1))}
                  >
                    Вперед
                  </Button>
                </Flex>
              </Flex>

              {promoCodesScheduleError ? (
                <Text color="red.400" fontSize="sm">
                  {promoCodesScheduleError}
                </Text>
              ) : null}

              <Skeleton isLoaded={!promoCodesScheduleLoading}>
                <Stack spacing="12px">
                  {promoCodesScheduleVisibleItems.length > 0 ? promoCodesScheduleVisibleItems.map((item) => (
                    <Box
                      key={`${promoCodesScheduleTab}-${item.id}-${item.code}`}
                      border="1px solid"
                      borderColor={tableCardBorder}
                      borderRadius="20px"
                      p="16px"
                    >
                      <Stack spacing="8px">
                        <Text color={textColor} fontSize="md" fontWeight="700">
                          {item.code}
                        </Text>
                        <SimpleGrid columns={{ base: 1, md: promoCodesScheduleTab === "claimed" ? 2 : 1 }} spacing="8px">
                          <Text color={textColorSecondary} fontSize="sm">
                            {promoCodesScheduleTab === "available"
                              ? `Доступен с: ${formatDateTimeLabel(item.availableFrom)}`
                              : promoCodesScheduleTab === "waiting"
                                ? `Станет доступен: ${formatDateTimeLabel(item.availableFrom)}`
                                : `Был в пуле с: ${formatDateTimeLabel(item.availableFrom)}`}
                          </Text>
                          {promoCodesScheduleTab === "claimed" ? (
                            <Text color={textColorSecondary} fontSize="sm">
                              Получен: {formatDateTimeLabel(item.awardedAt || item.claimedAt)}
                            </Text>
                          ) : null}
                        </SimpleGrid>
                        {promoCodesScheduleTab !== "claimed" ? (
                          <Flex gap="10px" direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "end" }}>
                            <FormControl>
                              <FormLabel color={textColorSecondary} fontSize="xs" fontWeight="700" mb="6px">
                                Вручную изменить время выхода в пул
                              </FormLabel>
                              <Input
                                type="datetime-local"
                                value={promoCodesScheduleDrafts[item.id] || ""}
                                onChange={(event) => setPromoCodesScheduleDrafts((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))}
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="brand"
                              minW={{ base: "100%", md: "160px" }}
                              isLoading={updatingPromoCodeId === item.id}
                              onClick={() => void handleSavePromoCodeAvailability(item)}
                            >
                              Сохранить
                            </Button>
                          </Flex>
                        ) : null}
                      </Stack>
                    </Box>
                  )) : (
                    <Box border="1px dashed" borderColor={tableCardBorder} borderRadius="20px" p="20px">
                      <Text color={textColorSecondary} fontSize="sm" textAlign="center">
                        {promoCodesScheduleLoading
                          ? "Загружаем расписание..."
                          : promoCodesScheduleTab === "available"
                            ? "Сейчас нет доступных промокодов."
                            : promoCodesScheduleTab === "waiting"
                              ? "Сейчас нет промокодов в ожидании."
                              : "Сейчас нет выданных промокодов."}
                      </Text>
                    </Box>
                  )}
                </Stack>
              </Skeleton>
            </Stack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={createPrizeModal.isOpen} onClose={createPrizeModal.onClose} isCentered size="4xl" scrollBehavior="inside">
        <ModalOverlay bg="rgba(15, 23, 42, 0.45)" />
        <ModalContent bg={modalBg} borderRadius="24px" p="4px" maxW={{ base: "94vw", xl: "960px" }} border="1px solid" borderColor={tableCardBorder}>
          <ModalHeader color={textColor} fontSize="xl" fontWeight="700">
            {editingPrizeId ? "Изменить приз" : "Добавить приз"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="24px">
            <Stack spacing="18px">
              <FormSection
                title="Основное"
                description="Базовые параметры позиции для призовой механики."
                isInvalid={Boolean(formValidation.sections.main)}
              >
                <Stack spacing="16px">
                  <FormControl isInvalid={Boolean(formValidation.fields.title)}>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Имя позиции
                    </FormLabel>
                    <Input
                      h="52px"
                      borderRadius="16px"
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Например: Скидка 300 ₽ на авиа"
                    />
                    <FormErrorMessage>{formValidation.fields.title}</FormErrorMessage>
                  </FormControl>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
                    <FormControl isInvalid={Boolean(formValidation.fields.category)}>
                      <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                        Категория
                      </FormLabel>
                      <Select
                        h="52px"
                        borderRadius="16px"
                        value={form.category}
                        onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                      >
                        <option value="">Без категории</option>
                        {PRIZE_CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </Select>
                      <FormErrorMessage>{formValidation.fields.category}</FormErrorMessage>
                    </FormControl>

                    <FormControl>
                      <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                        Тип промокода
                      </FormLabel>
                      <Select
                        h="52px"
                        borderRadius="16px"
                        value={form.promoCodeType}
                        onChange={(event) => setForm((current) => ({ ...current, promoCodeType: event.target.value }))}
                      >
                        {PROMO_CODE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value || "empty"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                  </SimpleGrid>
                </Stack>
              </FormSection>

              <FormSection
                title="Приз И Лимиты"
                description="Здесь выбирается сценарий с ограниченным количеством или безлимитная выдача."
                isInvalid={Boolean(formValidation.sections.limits)}
              >
                <Stack spacing="16px">
                  <FormControl>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Есть ли ограничение призов
                    </FormLabel>
                    <ToggleButtonGroup
                      value={form.hasPrizeLimit}
                      onChange={(nextValue) => setForm((current) => ({
                        ...current,
                        hasPrizeLimit: nextValue,
                        totalCount: nextValue ? current.totalCount : "",
                      }))}
                    />
                  </FormControl>

                  {form.hasPrizeLimit ? (
                    <>
                      <FormControl isInvalid={Boolean(formValidation.fields.promoCodes)}>
                        <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                          Промокоды
                        </FormLabel>
                        <Input
                          ref={promoCodesInputRef}
                          type="file"
                          accept=".txt,.csv,.xls,.xlsx"
                          display="none"
                          onChange={(event) => void handlePromoCodesFileChange(event.target.files)}
                        />
                        <Input
                          ref={promoCodesAppendInputRef}
                          type="file"
                          accept=".txt,.csv,.xls,.xlsx"
                          display="none"
                          onChange={(event) => void handleAppendPromoCodesFileChange(event.target.files)}
                        />
                        <Flex direction={{ base: "column", md: "row" }} gap="12px" align={{ base: "stretch", md: "center" }}>
                          <Button type="button" variant="brand" h="48px" onClick={() => promoCodesInputRef.current?.click()}>
                            Загрузить
                          </Button>
                          {editingPrizeId ? (
                            <>
                              <Button
                                type="button"
                                variant="light"
                                h="48px"
                                isLoading={promoCodesPoolAction === "append"}
                                loadingText="Догружаем"
                                onClick={() => promoCodesAppendInputRef.current?.click()}
                              >
                                Догрузить промокоды
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                colorScheme="red"
                                h="48px"
                                isLoading={promoCodesPoolAction === "clear"}
                                loadingText="Очищаем"
                                onClick={() => void handleClearPrizePromoCodes()}
                              >
                                Очистить все промокоды
                              </Button>
                            </>
                          ) : null}
                          {form.promoCodesFile?.name ? (
                            <Stack spacing="2px">
                              <Text color={textColorSecondary} fontSize="sm">
                                {form.promoCodesFile.name}
                              </Text>
                              <Text color={textColorSecondary} fontSize="sm">
                                В Excel файле обнаружено: {formatNumber(form.promoCodes.length)}
                              </Text>
                            </Stack>
                          ) : (
                            <Text color={textColorSecondary} fontSize="sm">
                              Можно загрузить список кодов файлом.
                            </Text>
                          )}
                        </Flex>
                        {promoCodesUploadError ? (
                          <Text color="red.400" fontSize="xs" mt="8px">
                            {promoCodesUploadError}
                          </Text>
                        ) : null}
                        {formValidation.fields.promoCodes ? (
                          <FormErrorMessage>{formValidation.fields.promoCodes}</FormErrorMessage>
                        ) : null}
                      </FormControl>

                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
                        <FormControl>
                          <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                            Старт выхода кодов в пул
                          </FormLabel>
                          <Input
                            h="52px"
                            borderRadius="16px"
                            type="datetime-local"
                            value={form.codeReleaseStart}
                            isDisabled={isPromoCodeReleaseScheduleDisabled}
                            onChange={(event) => setForm((current) => ({ ...current, codeReleaseStart: event.target.value }))}
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                            Конец выхода кодов в пул
                          </FormLabel>
                          <Input
                            h="52px"
                            borderRadius="16px"
                            type="datetime-local"
                            value={form.codeReleaseEnd}
                            isDisabled={isPromoCodeReleaseScheduleDisabled}
                            onChange={(event) => setForm((current) => ({ ...current, codeReleaseEnd: event.target.value }))}
                          />
                        </FormControl>
                      </SimpleGrid>
                      {editingPrizeId ? (
                        <Checkbox
                          colorScheme="brandScheme"
                          isChecked={isPromoCodeReleaseScheduleDisabled}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            disablePromoCodeReleaseSchedule: event.target.checked,
                            codeReleaseStart: event.target.checked ? "" : current.codeReleaseStart,
                            codeReleaseEnd: event.target.checked ? "" : current.codeReleaseEnd,
                          }))}
                        >
                          Отключить окно выхода в пул
                        </Checkbox>
                      ) : null}
                      <Text color={textColorSecondary} fontSize="sm">
                        Если окно указано, загруженные коды будут равномерно распределены по этому промежутку. Если оставить пустым, все коды сразу попадут в доступный пул.
                      </Text>
                      {promoReleaseIntervalHint ? (
                        <Text color={textColorSecondary} fontSize="sm">
                          {promoReleaseIntervalHint}
                        </Text>
                      ) : null}
                      {canOpenPromoCodeSchedule ? (
                        <Flex justify="flex-start">
                          <Button
                            type="button"
                            variant="light"
                            h="48px"
                            onClick={() => void handleOpenPromoCodesSchedule()}
                          >
                            Посмотреть расписание промокодов
                          </Button>
                        </Flex>
                      ) : null}
                    </>
                  ) : (
                    <FormControl isInvalid={Boolean(formValidation.fields.promoCodeValue)}>
                      <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                        Промокод
                      </FormLabel>
                      <Input
                        h="52px"
                        borderRadius="16px"
                        value={form.promoCodeValue}
                        onChange={(event) => setForm((current) => ({ ...current, promoCodeValue: event.target.value }))}
                        placeholder="Введите текст промокода"
                      />
                      <FormErrorMessage>{formValidation.fields.promoCodeValue}</FormErrorMessage>
                    </FormControl>
                  )}

                  <FormControl>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Шанс
                    </FormLabel>
                    <Input
                      h="52px"
                      borderRadius="16px"
                      value={form.chanceValue}
                      onChange={(event) => setForm((current) => ({ ...current, chanceValue: event.target.value }))}
                      placeholder="Например: 1x"
                    />
                  </FormControl>
                </Stack>
              </FormSection>

              <FormSection
                title="Ограничения И Период"
                description="Лимит на одного пользователя и временное окно действия позиции."
                isInvalid={Boolean(formValidation.sections.restrictions)}
              >
                <Stack spacing="16px">
                  <FormControl>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Есть ли ограничение призов на 1 пользователя
                    </FormLabel>
                    <ToggleButtonGroup
                      value={form.hasUserLimit}
                      onChange={(nextValue) => setForm((current) => ({
                        ...current,
                        hasUserLimit: nextValue,
                        userLimitCount: nextValue ? current.userLimitCount : "",
                      }))}
                    />
                  </FormControl>

                  {form.hasUserLimit ? (
                    <FormControl isInvalid={Boolean(formValidation.fields.userLimitCount)}>
                      <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                        Кол-во в период
                      </FormLabel>
                      <Input
                        h="52px"
                        borderRadius="16px"
                        type="number"
                        min="1"
                        value={form.userLimitCount}
                        onChange={(event) => setForm((current) => ({ ...current, userLimitCount: event.target.value }))}
                        placeholder="Например: 1"
                      />
                      <FormErrorMessage>{formValidation.fields.userLimitCount}</FormErrorMessage>
                    </FormControl>
                  ) : null}

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
                    <FormControl isInvalid={Boolean(formValidation.fields.activeFrom)}>
                      <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                        Период розыгрыша: от
                      </FormLabel>
                      <Input
                        h="52px"
                        borderRadius="16px"
                        type="date"
                        value={form.activeFrom}
                        onChange={(event) => setForm((current) => ({ ...current, activeFrom: event.target.value }))}
                      />
                      <FormErrorMessage>{formValidation.fields.activeFrom}</FormErrorMessage>
                    </FormControl>

                    <FormControl isInvalid={Boolean(formValidation.fields.activeTo)}>
                      <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                        Период розыгрыша: до
                      </FormLabel>
                      <Input
                        h="52px"
                        borderRadius="16px"
                        type="date"
                        value={form.activeTo}
                        onChange={(event) => setForm((current) => ({ ...current, activeTo: event.target.value }))}
                      />
                      <FormErrorMessage>{formValidation.fields.activeTo}</FormErrorMessage>
                    </FormControl>
                  </SimpleGrid>
                </Stack>
              </FormSection>

              <FormSection
                title="Контент Для Интерфейса"
                description="Картинка и тексты, которые будут использоваться на клиенте."
                isInvalid={Boolean(formValidation.sections.content)}
              >
                <Stack spacing="16px">
                  <FormControl isInvalid={Boolean(formValidation.fields.rouletteImage)}>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Изображение чемодана для рулетки
                    </FormLabel>
                    <ImageUploader
                      value={form.rouletteImage}
                      onChange={(nextValue) => setForm((current) => ({ ...current, rouletteImage: nextValue }))}
                    />
                    <FormErrorMessage>{formValidation.fields.rouletteImage}</FormErrorMessage>
                  </FormControl>

                  <FormControl>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Текст для Мои призы
                    </FormLabel>
                    <Textarea
                      minH="140px"
                      borderRadius="20px"
                      resize="vertical"
                      value={form.myPrizeText}
                      onChange={(event) => setForm((current) => ({ ...current, myPrizeText: event.target.value }))}
                      placeholder="Например: Скидка 800 ₽"
                    />
                    <Text mt="8px" color={textColorSecondary} fontSize="xs">
                      Переносы строки сохраняются. Используйте Enter, чтобы разбить текст на несколько строк.
                    </Text>
                  </FormControl>

                  <FormControl isInvalid={Boolean(formValidation.fields.rouletteDescription)}>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Текстовое описание для рулетки
                    </FormLabel>
                    <Textarea
                      minH="180px"
                      borderRadius="20px"
                      resize="vertical"
                      value={form.rouletteDescription}
                      onChange={(event) => setForm((current) => ({ ...current, rouletteDescription: event.target.value }))}
                      placeholder="Описание приза для интерфейса рулетки"
                    />
                    <Text mt="8px" color={textColorSecondary} fontSize="xs">
                      Переносы строки сохраняются. Используйте Enter, чтобы разбить описание на несколько строк.
                    </Text>
                    <FormErrorMessage>{formValidation.fields.rouletteDescription}</FormErrorMessage>
                  </FormControl>
                </Stack>
              </FormSection>

              <Flex justify="flex-end" gap="12px" wrap="wrap">
                <Button variant="light" h="52px" px="24px" onClick={createPrizeModal.onClose}>
                  Отмена
                </Button>
                <Button
                  variant="brand"
                  h="52px"
                  px="24px"
                  fontWeight="700"
                  isLoading={creating}
                  loadingText="Сохраняем"
                  onClick={handleCreatePrize}
                >
                  {editingPrizeId ? "Сохранить изменения" : "Добавить приз"}
                </Button>
              </Flex>
            </Stack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal isOpen={nonPrizeModal.isOpen} onClose={nonPrizeModal.onClose} isCentered size="2xl" scrollBehavior="inside">
        <ModalOverlay bg="rgba(15, 23, 42, 0.45)" />
        <ModalContent bg={modalBg} borderRadius="24px" p="4px" maxW={{ base: "94vw", xl: "760px" }} border="1px solid" borderColor={tableCardBorder}>
          <ModalHeader color={textColor} fontSize="xl" fontWeight="700">
            {editingPrizeId ? "Изменить не приз" : "Добавить не приз"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="24px">
            <FormSection
              title="Не Приз"
              description="Упрощённая форма для технической или пустой позиции без категории и промокода."
              isInvalid={Boolean(formValidation.sections.nonPrize)}
            >
              <Stack spacing="16px">
                <FormControl isInvalid={Boolean(formValidation.fields.title)}>
                  <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                    Имя позиции
                  </FormLabel>
                  <Input
                    h="52px"
                    borderRadius="16px"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Например: Пустой слот"
                  />
                  <FormErrorMessage>{formValidation.fields.title}</FormErrorMessage>
                </FormControl>

                <FormControl>
                  <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                    Шанс
                  </FormLabel>
                  <Input
                    h="52px"
                    borderRadius="16px"
                    value={form.chanceValue}
                    onChange={(event) => setForm((current) => ({ ...current, chanceValue: event.target.value }))}
                    placeholder="Например: 1x"
                  />
                </FormControl>

                <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
                  <FormControl isInvalid={Boolean(formValidation.fields.activeFrom)}>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Период розыгрыша: от
                    </FormLabel>
                    <Input
                      h="52px"
                      borderRadius="16px"
                      type="date"
                      value={form.activeFrom}
                      onChange={(event) => setForm((current) => ({ ...current, activeFrom: event.target.value }))}
                    />
                    <FormErrorMessage>{formValidation.fields.activeFrom}</FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={Boolean(formValidation.fields.activeTo)}>
                    <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                      Период розыгрыша: до
                    </FormLabel>
                    <Input
                      h="52px"
                      borderRadius="16px"
                      type="date"
                      value={form.activeTo}
                      onChange={(event) => setForm((current) => ({ ...current, activeTo: event.target.value }))}
                    />
                    <FormErrorMessage>{formValidation.fields.activeTo}</FormErrorMessage>
                  </FormControl>
                </SimpleGrid>

                <FormControl isInvalid={Boolean(formValidation.fields.rouletteImage)}>
                  <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                    Изображение чемодана для рулетки
                  </FormLabel>
                  <ImageUploader
                    value={form.rouletteImage}
                    onChange={(nextValue) => setForm((current) => ({ ...current, rouletteImage: nextValue }))}
                  />
                  <FormErrorMessage>{formValidation.fields.rouletteImage}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={Boolean(formValidation.fields.rouletteDescription)}>
                  <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                    Описание
                  </FormLabel>
                  <Textarea
                    minH="160px"
                    borderRadius="20px"
                    resize="vertical"
                    value={form.rouletteDescriptionDraft}
                    onChange={(event) => setForm((current) => ({ ...current, rouletteDescriptionDraft: event.target.value }))}
                    placeholder="Введите описание и нажмите «Добавить»"
                  />
                  <FormErrorMessage>{formValidation.fields.rouletteDescription}</FormErrorMessage>
                </FormControl>

                <Flex justify="flex-start">
                  <Button
                    type="button"
                    variant="brand"
                    h="48px"
                    isDisabled={!String(form.rouletteDescriptionDraft || "").trim()}
                    onClick={() => setForm((current) => {
                      const nextDescription = String(current.rouletteDescriptionDraft || "").trim();

                      if (!nextDescription) {
                        return current;
                      }

                      return {
                        ...current,
                        rouletteDescriptions: normalizeRouletteDescriptions([
                          ...current.rouletteDescriptions,
                          nextDescription,
                        ]),
                        rouletteDescriptionDraft: "",
                      };
                    })}
                  >
                    Добавить
                  </Button>
                </Flex>

                <FormControl>
                  <FormLabel color={textColor} fontSize="sm" fontWeight="700">
                    Добавленные описания
                  </FormLabel>
                  <Stack spacing="10px">
                    {form.rouletteDescriptions.length ? form.rouletteDescriptions.map((description) => (
                      <Box
                        key={description}
                        border="1px solid"
                        borderColor={borderColor}
                        borderRadius="18px"
                        px="16px"
                        py="14px"
                      >
                        <Flex justify="space-between" align="flex-start" gap="12px">
                          <Text color={textColor} fontSize="sm" whiteSpace="pre-wrap">
                            {description}
                          </Text>
                          <Button
                            type="button"
                            variant="outline"
                            colorScheme="red"
                            size="sm"
                            flexShrink={0}
                            onClick={() => setForm((current) => ({
                              ...current,
                              rouletteDescriptions: current.rouletteDescriptions.filter((item) => item !== description),
                            }))}
                          >
                            Удалить
                          </Button>
                        </Flex>
                      </Box>
                    )) : (
                      <Box border="1px dashed" borderColor={borderColor} borderRadius="18px" px="16px" py="14px">
                        <Text color={textColorSecondary} fontSize="sm">
                          Пока нет описаний. Добавьте хотя бы одно описание для неприза.
                        </Text>
                      </Box>
                    )}
                  </Stack>
                  <Text mt="8px" color={textColorSecondary} fontSize="xs">
                    Если описаний несколько, в bootstrap и при выпадении неприза будет отдаваться случайный текст из списка.
                  </Text>
                </FormControl>

                <Flex justify="flex-end" gap="12px" wrap="wrap">
                  <Button variant="light" h="52px" px="24px" onClick={nonPrizeModal.onClose}>
                    Отмена
                  </Button>
                  <Button
                    variant="brand"
                    h="52px"
                    px="24px"
                    fontWeight="700"
                    isLoading={creating}
                    loadingText="Сохраняем"
                    onClick={handleCreatePrize}
                  >
                    {editingPrizeId ? "Сохранить изменения" : "Добавить"}
                  </Button>
                </Flex>
              </Stack>
            </FormSection>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
