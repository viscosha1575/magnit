// Chakra Imports
import {
  Button,
  Flex,
  Icon,
  useColorModeValue,
  useColorMode,
} from '@chakra-ui/react';
import { SidebarResponsive } from 'components/sidebar/Sidebar';
import PropTypes from 'prop-types';
import React from 'react';
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { IoMdMoon, IoMdSunny } from 'react-icons/io';
import routes from 'routes';
import {
  getTelegramWebAppSync,
  isTelegramFullscreen,
  toggleMiniAppFullscreen,
} from '../../telegram';

export default function HeaderLinks(props) {
  const { colorMode, toggleColorMode } = useColorMode();
  const [isFullscreen, setIsFullscreen] = React.useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return isTelegramFullscreen() || Boolean(document.fullscreenElement);
  });
  // Chakra Color Mode
  const navbarIcon = useColorModeValue('gray.400', 'white');
  const buttonBg = useColorModeValue('white', 'navy.800');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)',
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncFullscreenState = () => {
      setIsFullscreen(isTelegramFullscreen() || Boolean(document.fullscreenElement));
    };

    const telegramWebApp = getTelegramWebAppSync();

    telegramWebApp?.onEvent?.('fullscreenChanged', syncFullscreenState);
    document.addEventListener('fullscreenchange', syncFullscreenState);

    return () => {
      telegramWebApp?.offEvent?.('fullscreenChanged', syncFullscreenState);
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  const handleFullscreenClick = React.useCallback(async () => {
    await toggleMiniAppFullscreen();
    setIsFullscreen(isTelegramFullscreen() || Boolean(document.fullscreenElement));
  }, []);

  return (
    <Flex
      w={{ sm: '100%', md: 'auto' }}
      alignItems="center"
      flexDirection="row"
      flexWrap={{ base: 'wrap', md: 'nowrap' }}
      gap="10px"
    >
      <SidebarResponsive routes={routes} />

      <Button
        variant="no-hover"
        bg={buttonBg}
        p="0px"
        minW="unset"
        minH="unset"
        h="48px"
        w="48px"
        borderRadius="999px"
        boxShadow={shadow}
        onClick={handleFullscreenClick}
        aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть полноэкранный режим'}
        _hover={{ bg: buttonBg }}
        _active={{ bg: buttonBg }}
      >
        <Icon
          h="18px"
          w="18px"
          color={navbarIcon}
          as={isFullscreen ? FiMinimize2 : FiMaximize2}
        />
      </Button>

      <Button
        variant="no-hover"
        bg={buttonBg}
        p="0px"
        minW="unset"
        minH="unset"
        h="48px"
        w="48px"
        borderRadius="999px"
        boxShadow={shadow}
        onClick={toggleColorMode}
        aria-label="Сменить тему"
        _hover={{ bg: buttonBg }}
        _active={{ bg: buttonBg }}
      >
        <Icon
          h="18px"
          w="18px"
          color={navbarIcon}
          as={colorMode === 'light' ? IoMdMoon : IoMdSunny}
        />
      </Button>
    </Flex>
  );
}

HeaderLinks.propTypes = {
  variant: PropTypes.string,
  fixed: PropTypes.bool,
  onOpen: PropTypes.func,
};
