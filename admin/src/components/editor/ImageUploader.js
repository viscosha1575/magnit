import {
  Box,
  Button,
  Flex,
  Image,
  Input,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { useRef, useState } from "react";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export default function ImageUploader({
  value,
  onChange,
}) {
  const fileInputRef = useRef(null);
  const [localError, setLocalError] = useState("");

  const borderColor = useColorModeValue("rgba(224, 229, 242, 0.95)", "rgba(255, 255, 255, 0.08)");
  const areaBg = useColorModeValue("white", "navy.800");
  const subtleBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.03)");
  const textColor = useColorModeValue("navy.700", "white");
  const textColorSecondary = useColorModeValue("secondaryGray.600", "secondaryGray.500");

  async function handleFiles(filesList) {
    const nextFile = Array.from(filesList || [])[0];

    if (!nextFile) {
      return;
    }

    if (!nextFile.type.startsWith("image/")) {
      setLocalError("Можно загрузить только изображение.");
      return;
    }

    setLocalError("");

    try {
      const previewUrl = await fileToDataUrl(nextFile);
      onChange?.({
        name: nextFile.name,
        previewUrl,
      });
    } catch (error) {
      setLocalError(error.message || "Не удалось загрузить изображение.");
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    void handleFiles(event.dataTransfer?.files);
  }

  function handlePaste(event) {
    if (event.clipboardData?.files?.length) {
      event.preventDefault();
      void handleFiles(event.clipboardData.files);
    }
  }

  return (
    <Box>
      <Box
        border="1px dashed"
        borderColor={borderColor}
        borderRadius="20px"
        bg={areaBg}
        p="18px"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          align={{ base: "stretch", md: "center" }}
          gap="18px"
        >
          <Box
            flex="0 0 160px"
            h="120px"
            borderRadius="18px"
            overflow="hidden"
            bg={subtleBg}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {value?.previewUrl ? (
              <Image
                src={value.previewUrl}
                alt={value.name || "Загруженное фото"}
                objectFit="cover"
                w="100%"
                h="100%"
              />
            ) : (
              <Text color={textColorSecondary} fontSize="sm" textAlign="center" px="12px">
                Фото для рассылки
              </Text>
            )}
          </Box>

          <Flex direction="column" align="start" gap="10px" flex="1">
            <Text color={textColor} fontSize="md" fontWeight="700">
              Загрузите фото
            </Text>
            <Text color={textColorSecondary} fontSize="sm">
              Перетащите изображение сюда, вставьте из буфера или выберите файл вручную.
            </Text>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              display="none"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Flex gap="10px" wrap="wrap">
              <Button
                type="button"
                bg="brand.500"
                color="white"
                borderRadius="14px"
                fontWeight="700"
                onClick={() => fileInputRef.current?.click()}
                _hover={{ bg: "brand.600" }}
              >
                Выбрать фото
              </Button>
              {value?.previewUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  borderRadius="14px"
                  onClick={() => {
                    setLocalError("");
                    onChange?.(null);
                  }}
                >
                  Удалить
                </Button>
              ) : null}
            </Flex>
            {value?.name ? (
              <Text color={textColorSecondary} fontSize="xs">
                {value.name}
              </Text>
            ) : null}
            {localError ? (
              <Text color="red.400" fontSize="xs">
                {localError}
              </Text>
            ) : null}
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
}
