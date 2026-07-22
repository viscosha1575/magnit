import React from "react";
import { Box, Flex, HStack, useColorModeValue } from "@chakra-ui/react";
import { NavLink, useLocation } from "react-router-dom";

const ADMIN_SAFE_AREA_BOTTOM = "var(--admin-safe-area-bottom, env(safe-area-inset-bottom, 0px))";
const ADMIN_SAFE_AREA_LEFT = "var(--admin-safe-area-left, env(safe-area-inset-left, 0px))";
const ADMIN_SAFE_AREA_RIGHT = "var(--admin-safe-area-right, env(safe-area-inset-right, 0px))";

function isRouteActive(pathname, route) {
  return pathname.includes(`${route.layout}${route.path}`);
}

export default function MobileBottomNav({ routes = [] }) {
  const location = useLocation();
  const navRoutes = routes.filter((route) => route?.layout === "/admin" && route?.path && route?.icon);
  const navbarBg = useColorModeValue("rgba(244, 247, 254, 0.72)", "rgba(11,20,55,0.72)");
  const navbarBorder = useColorModeValue("rgba(255,255,255,0.72)", "rgba(255,255,255,0.08)");
  const inactiveIcon = useColorModeValue("secondaryGray.600", "secondaryGray.500");
  const activeIcon = useColorModeValue("brand.500", "white");
  const activeItemBg = useColorModeValue("rgba(227, 6, 19, 0.1)", "rgba(255, 255, 255, 0.12)");

  if (navRoutes.length === 0) {
    return null;
  }

  return (
    <Box
      display={{ base: "block", md: "none" }}
      position="fixed"
      left={`calc(${ADMIN_SAFE_AREA_LEFT} + 8px)`}
      right={`calc(${ADMIN_SAFE_AREA_RIGHT} + 8px)`}
      bottom={`calc(${ADMIN_SAFE_AREA_BOTTOM} + 8px)`}
      zIndex="1200"
    >
      <Flex
        bg={navbarBg}
        border="1.5px solid"
        borderColor={navbarBorder}
        borderRadius="24px"
        backdropFilter="blur(20px)"
        boxShadow="0 14px 34px rgba(112, 144, 176, 0.18)"
        px="10px"
        py="8px"
        justify="center"
      >
        <HStack spacing="8px" w="100%" justify="space-between">
          {navRoutes.map((route) => {
            const isActive = isRouteActive(location.pathname, route);

            return (
              <NavLink
                key={`${route.layout}${route.path}`}
                to={`${route.layout}${route.path}`}
                aria-label={route.name}
                style={{ flex: 1 }}
              >
                <Flex
                  align="center"
                  justify="center"
                  h="44px"
                  w="100%"
                  borderRadius="16px"
                  bg={isActive ? activeItemBg : "transparent"}
                  color={isActive ? activeIcon : inactiveIcon}
                  transition="background-color 0.2s ease, color 0.2s ease"
                >
                  {route.icon}
                </Flex>
              </NavLink>
            );
          })}
        </HStack>
      </Flex>
    </Box>
  );
}
