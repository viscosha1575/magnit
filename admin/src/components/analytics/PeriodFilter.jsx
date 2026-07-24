import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";

const PERIODS = [
  ["today", "Сегодня"],
  ["7d", "7 дней"],
  ["30d", "30 дней"],
  ["all", "Всё время"],
];

const today = new Date();
const TODAY = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

export default function PeriodFilter({
  range,
  dateFrom,
  dateTo,
  onPreset,
  onDateFromChange,
  onDateToChange,
  onApply,
  error,
  secondaryColor,
  updatedAt,
}) {
  return (
    <Stack align={{ base: "stretch", lg: "end" }} spacing="8px" w={{ base: "100%", lg: "auto" }}>
      <Flex gap="8px" wrap="wrap" justify={{ base: "flex-start", lg: "flex-end" }}>
        {PERIODS.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            borderRadius="10px"
            colorScheme="brand"
            variant={range === value ? "solid" : "outline"}
            onClick={() => onPreset(value)}
          >
            {label}
          </Button>
        ))}
      </Flex>

      <Flex align="end" gap="8px" wrap="wrap" justify={{ base: "flex-start", lg: "flex-end" }}>
        <FormControl w={{ base: "calc(50% - 4px)", sm: "160px" }}>
          <FormLabel mb="4px" color={secondaryColor} fontSize="xs">Дата от</FormLabel>
          <Input
            type="date"
            size="sm"
            max={dateTo || TODAY}
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </FormControl>
        <FormControl w={{ base: "calc(50% - 4px)", sm: "160px" }}>
          <FormLabel mb="4px" color={secondaryColor} fontSize="xs">Дата до</FormLabel>
          <Input
            type="date"
            size="sm"
            min={dateFrom || undefined}
            max={TODAY}
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </FormControl>
        <Button
          size="sm"
          borderRadius="10px"
          colorScheme="brand"
          onClick={onApply}
          isDisabled={!dateFrom || !dateTo}
        >
          Применить
        </Button>
      </Flex>

      {error ? <Text color="red.500" fontSize="sm">{error}</Text> : null}
      {updatedAt ? (
        <Text color={secondaryColor} fontSize="sm">
          Обновлено: {new Date(updatedAt).toLocaleString("ru-RU")}
        </Text>
      ) : null}
    </Stack>
  );
}
