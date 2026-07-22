import React from "react";

// Chakra imports
import { Box, Flex, Text, useColorModeValue } from "@chakra-ui/react";

import { HSeparator } from "components/separator/Separator";

export function SidebarBrand() {
  //   Chakra color mode
  let logoColor = useColorModeValue("navy.700", "white");

  return (
    <Flex align='center' direction='column'>
      <Flex
        align="center"
        gap="0px"
        my="28px"
        w="100%"
        px="10px"
      >
        <Box>
          <Text color={logoColor} fontSize="30px" fontWeight="800" lineHeight="1.05" letterSpacing="-0.04em">
            Магнит
          </Text>
        </Box>
      </Flex>
      <HSeparator mb='20px' />
    </Flex>
  );
}

export default SidebarBrand;
