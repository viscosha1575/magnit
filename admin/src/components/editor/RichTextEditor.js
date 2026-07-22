import {
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeUrl(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(String(rawValue).trim(), window.location.origin);

    if (!/^https?:$/.test(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

const URL_PATTERN = /((https?:\/\/|www\.)[^\s<]+)/gi;

function buildAnchorHtml(rawUrl) {
  const href = normalizeUrl(rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl);

  if (!href) {
    return escapeHtml(rawUrl);
  }

  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a>`;
}

function linkifyHtmlTextNodes(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    const currentNode = walker.currentNode;

    if (currentNode?.parentElement?.closest("a")) {
      continue;
    }

    if (URL_PATTERN.test(currentNode.textContent || "")) {
      textNodes.push(currentNode);
    }

    URL_PATTERN.lastIndex = 0;
  }

  for (const textNode of textNodes) {
    const source = textNode.textContent || "";
    const replacement = source.replace(URL_PATTERN, (match) => buildAnchorHtml(match));
    const fragment = document.createRange().createContextualFragment(replacement);
    textNode.parentNode?.replaceChild(fragment, textNode);
    URL_PATTERN.lastIndex = 0;
  }

  return template.innerHTML;
}

function insertHtmlAtRange(range, html) {
  if (!range) {
    return;
  }

  const fragment = range.createContextualFragment(html);
  const lastNode = fragment.lastChild;

  range.deleteContents();
  range.insertNode(fragment);

  if (lastNode) {
    const nextRange = document.createRange();
    nextRange.setStartAfter(lastNode);
    nextRange.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
  }
}

function isEffectivelyEmptyBlock(element) {
  if (!element) {
    return false;
  }

  const normalizedText = String(element.textContent || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, "")
    .trim();

  return !normalizedText;
}

const EMPTY_TOOLBAR_STATE = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
  block: "p",
};

function ToolbarButton({
  active = false,
  children,
  onClick,
  title,
}) {
  const activeBg = useColorModeValue("rgba(66, 42, 251, 0.12)", "rgba(255, 255, 255, 0.12)");
  const activeColor = useColorModeValue("brand.500", "white");
  const idleBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.04)");
  const idleColor = useColorModeValue("secondaryGray.700", "secondaryGray.400");
  const hoverBg = useColorModeValue("secondaryGray.400", "rgba(255, 255, 255, 0.08)");

  return (
    <Button
      type="button"
      size="sm"
      minW="40px"
      h="36px"
      px="10px"
      borderRadius="12px"
      bg={active ? activeBg : idleBg}
      color={active ? activeColor : idleColor}
      fontWeight="700"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      _hover={{ bg: active ? activeBg : hoverBg }}
    >
      {children}
    </Button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Начните вводить текст…",
}) {
  const editorRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const isLinkModalFlowRef = useRef(false);
  const linkMarkerIdRef = useRef("");
  const [toolbarState, setToolbarState] = useState(EMPTY_TOOLBAR_STATE);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSelectionCollapsed, setLinkSelectionCollapsed] = useState(true);
  const { isOpen: isLinkModalOpen, onOpen: openLinkModal, onClose: closeLinkModal } = useDisclosure();

  const borderColor = useColorModeValue("gray.200", "whiteAlpha.100");
  const areaBg = useColorModeValue("white", "navy.800");
  const toolbarBg = useColorModeValue("secondaryGray.300", "rgba(255, 255, 255, 0.03)");
  const toolbarBorder = useColorModeValue("rgba(224, 229, 242, 0.9)", "rgba(255, 255, 255, 0.08)");
  const placeholderColor = useColorModeValue("secondaryGray.500", "secondaryGray.400");
  const textColor = useColorModeValue("navy.700", "white");
  const modalBg = useColorModeValue("white", "navy.800");
  const modalTextColor = useColorModeValue("navy.700", "white");
  const modalMutedColor = useColorModeValue("secondaryGray.600", "secondaryGray.400");

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const nextHtml = String(value || "");

    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [value]);

  useEffect(() => {
    function refreshToolbar() {
      try {
        const selection = window.getSelection();
        const node = selection?.anchorNode || null;
        const element = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        const block = element?.closest?.("h1,h2,h3,p,div,li");

        setToolbarState({
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          underline: document.queryCommandState("underline"),
          unorderedList: document.queryCommandState("insertUnorderedList"),
          orderedList: document.queryCommandState("insertOrderedList"),
          block: block?.tagName?.toLowerCase?.() || "p",
        });
      } catch {
        setToolbarState(EMPTY_TOOLBAR_STATE);
      }
    }

    document.addEventListener("selectionchange", refreshToolbar);

    return () => {
      document.removeEventListener("selectionchange", refreshToolbar);
    };
  }, []);

  function emitValue() {
    onChange?.((editorRef.current?.innerHTML || "").trim());
  }

  function createLinkMarker(range) {
    const marker = document.createElement("span");
    marker.setAttribute("data-link-marker", "true");
    marker.setAttribute("data-link-marker-id", crypto.randomUUID());
    marker.textContent = "\u200B";

    const markerRange = range.cloneRange();
    markerRange.insertNode(marker);
    linkMarkerIdRef.current = marker.getAttribute("data-link-marker-id") || "";

    const selection = window.getSelection();
    const nextRange = document.createRange();
    nextRange.setStartAfter(marker);
    nextRange.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(nextRange);

    return marker;
  }

  function findLinkMarker() {
    if (!editorRef.current || !linkMarkerIdRef.current) {
      return null;
    }

    return editorRef.current.querySelector(
      `[data-link-marker="true"][data-link-marker-id="${linkMarkerIdRef.current}"]`,
    );
  }

  function clearLinkMarker() {
    const marker = findLinkMarker();

    if (marker) {
      marker.remove();
    }

    linkMarkerIdRef.current = "";
  }

  function exec(command, commandValue) {
    document.execCommand(command, false, commandValue);
    emitValue();
  }

  function handlePaste(event) {
    const text = event.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
    emitValue();
  }

  function handleBlur() {
    if (!editorRef.current) {
      return;
    }

    if (isLinkModalFlowRef.current) {
      return;
    }

    const normalizedHtml = editorRef.current.innerHTML
      .replace(/<div><br><\/div>/g, "<p><br></p>")
      .replace(/<div>/g, "<p>")
      .replace(/<\/div>/g, "</p>")
      .trim();
    const linkifiedHtml = linkifyHtmlTextNodes(normalizedHtml);

    if (linkifiedHtml !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = linkifiedHtml;
    }

    onChange?.(linkifiedHtml);
  }

  function applyParagraph() {
    document.execCommand("formatBlock", false, "p");
    emitValue();
  }

  function addLink() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const selectedText = selection?.toString() || "";
    const isInsideEditor = range
      ? editorRef.current?.contains(range.commonAncestorContainer)
      : false;

    if (range && isInsideEditor) {
      savedSelectionRef.current = range.cloneRange();
      if (selection.isCollapsed) {
        createLinkMarker(range);
      } else {
        clearLinkMarker();
      }
    } else {
      savedSelectionRef.current = null;
      clearLinkMarker();
    }

    isLinkModalFlowRef.current = true;
    setLinkSelectionCollapsed(!selection || selection.isCollapsed);
    setLinkUrl("https://");
    setLinkText(selectedText);
    setLinkError("");
    openLinkModal();
  }

  function handleCloseLinkModal() {
    setLinkUrl("https://");
    setLinkText("");
    setLinkError("");
    setLinkSelectionCollapsed(true);
    savedSelectionRef.current = null;
    clearLinkMarker();
    isLinkModalFlowRef.current = false;
    closeLinkModal();
  }

  function handleSubmitLink() {
    const href = normalizeUrl(linkUrl);

    if (!href) {
      setLinkError("Укажите корректную ссылку с http:// или https://");
      return;
    }

    if (!editorRef.current) {
      handleCloseLinkModal();
      return;
    }

    editorRef.current.focus();

    const selection = window.getSelection();
    const restoredRange = savedSelectionRef.current ? savedSelectionRef.current.cloneRange() : null;

    if (selection) {
      selection.removeAllRanges();

      if (restoredRange) {
        selection.addRange(restoredRange);
      }
    }

    if (linkSelectionCollapsed || !restoredRange || restoredRange.collapsed) {
      const nextLinkText = String(linkText || "").trim() || href;
      const marker = findLinkMarker();

      if (marker?.parentNode) {
        const anchorHtml = `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(nextLinkText)}</a>`;
        const parentBlock = marker.parentElement?.closest?.("p,div,li");
        let lastNode = null;

        if (parentBlock && isEffectivelyEmptyBlock(parentBlock)) {
          parentBlock.innerHTML = anchorHtml;
          lastNode = parentBlock.lastChild;
        } else {
          const fragment = document.createRange().createContextualFragment(anchorHtml);
          lastNode = fragment.lastChild;
          marker.replaceWith(fragment);
        }

        if (lastNode) {
          const nextRange = document.createRange();
          nextRange.setStartAfter(lastNode);
          nextRange.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(nextRange);
        }
      } else {
        insertHtmlAtRange(
          restoredRange || selection?.getRangeAt?.(0) || null,
          `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(nextLinkText)}</a>`,
        );
      }
    } else {
      document.execCommand("createLink", false, href);

      const anchor = selection?.anchorNode?.parentElement?.closest?.("a");
      if (anchor) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");

        if (String(linkText || "").trim()) {
          anchor.textContent = linkText.trim();
        }
      }
    }

    emitValue();
    editorRef.current?.focus();
    handleCloseLinkModal();
  }

  function clearFormatting() {
    document.execCommand("removeFormat");
    emitValue();
  }

  return (
    <Box>
      <Flex
        wrap="wrap"
        gap="8px"
        p="12px"
        border="1px solid"
        borderColor={toolbarBorder}
        borderRadius="18px 18px 0 0"
        bg={toolbarBg}
      >
        <ToolbarButton
          active={toolbarState.bold}
          onClick={() => exec("bold")}
          title="Жирный"
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState.italic}
          onClick={() => exec("italic")}
          title="Курсив"
        >
          I
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState.underline}
          onClick={() => exec("underline")}
          title="Подчёркнутый"
        >
          U
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState.unorderedList}
          onClick={() => exec("insertUnorderedList")}
          title="Маркированный список"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState.orderedList}
          onClick={() => exec("insertOrderedList")}
          title="Нумерованный список"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          active={toolbarState.block === "p" || toolbarState.block === "div"}
          onClick={applyParagraph}
          title="Обычный текст"
        >
          Текст
        </ToolbarButton>
        <ToolbarButton
          onClick={addLink}
          title="Добавить ссылку"
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          onClick={() => exec("unlink")}
          title="Удалить ссылку"
        >
          Unlink
        </ToolbarButton>
        <ToolbarButton
          onClick={clearFormatting}
          title="Очистить форматирование"
        >
          Clear
        </ToolbarButton>
      </Flex>

      <Box
        position="relative"
        border="1px solid"
        borderTop="0"
        borderColor={borderColor}
        borderRadius="0 0 18px 18px"
        bg={areaBg}
        minH="220px"
      >
        {!String(value || "").trim() ? (
          <Text
            position="absolute"
            top="18px"
            left="20px"
            color={placeholderColor}
            fontSize="sm"
            pointerEvents="none"
          >
            {placeholder}
          </Text>
        ) : null}

      <Box
        ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          minH="220px"
          p="18px 20px"
          color={textColor}
          fontSize="sm"
          lineHeight="1.7"
          whiteSpace="pre-wrap"
          outline="none"
          onInput={emitValue}
          onBlur={handleBlur}
          onPaste={handlePaste}
          sx={{
            "& p": {
              margin: 0,
              minHeight: "1.5em",
            },
            "& ul, & ol": {
              paddingLeft: "20px",
              margin: 0,
            },
            "& a": {
              color: "var(--chakra-colors-brand-500)",
              textDecoration: "underline",
            },
          }}
        />
      </Box>
      <Modal isOpen={isLinkModalOpen} onClose={handleCloseLinkModal} isCentered>
        <ModalOverlay bg="rgba(15, 23, 42, 0.45)" />
        <ModalContent bg={modalBg} borderRadius="24px" border="1px solid" borderColor={toolbarBorder} boxShadow="0px 18px 40px rgba(112, 144, 176, 0.18)">
          <ModalHeader color={modalTextColor} fontSize="xl" fontWeight="700" pb="8px">
            Добавить ссылку
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap="14px">
              <Box>
                <Text color={modalTextColor} fontSize="sm" fontWeight="700" mb="8px">
                  URL
                </Text>
                <Input
                  h="52px"
                  borderRadius="16px"
                  borderColor={borderColor}
                  value={linkUrl}
                  onChange={(event) => {
                    setLinkUrl(event.target.value);
                    if (linkError) {
                      setLinkError("");
                    }
                  }}
                  placeholder="https://example.com"
                />
              </Box>
              <Box>
                <Text color={modalTextColor} fontSize="sm" fontWeight="700" mb="8px">
                  Текст ссылки
                </Text>
                <Input
                  h="52px"
                  borderRadius="16px"
                  borderColor={borderColor}
                  value={linkText}
                  onChange={(event) => setLinkText(event.target.value)}
                  placeholder="Например: Открыть сайт"
                />
                <Text color={modalMutedColor} fontSize="xs" mt="8px">
                  Если поле оставить пустым, подставим сам URL.
                </Text>
              </Box>
              {linkError ? (
                <Text color="red.400" fontSize="sm" fontWeight="600">
                  {linkError}
                </Text>
              ) : null}
            </Flex>
          </ModalBody>
          <ModalFooter gap="10px">
            <Button variant="outline" borderRadius="16px" onClick={handleCloseLinkModal}>
              Отмена
            </Button>
            <Button bg="brand.500" color="white" borderRadius="16px" fontWeight="700" onClick={handleSubmitLink} _hover={{ bg: "brand.600" }}>
              Добавить
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
