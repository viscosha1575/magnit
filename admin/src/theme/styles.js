import { mode } from "@chakra-ui/theme-tools";
export const globalStyles = {
  colors: {
    brand: {
      100: "#FFE6E9",
      200: "#FF6677",
      300: "#F43A50",
      400: "#E9001B",
      500: "#E30613",
      600: "#C70016",
      700: "#A90013",
      800: "#82000F",
      900: "#5E000B",
    },
    brandScheme: {
      100: "#FFE6E9",
      200: "#FF6677",
      300: "#F43A50",
      400: "#E9001B",
      500: "#E30613",
      600: "#C70016",
      700: "#A90013",
      800: "#82000F",
      900: "#5E000B",
    },
    brandTabs: {
      100: "#FFE6E9",
      200: "#FF6677",
      300: "#F43A50",
      400: "#E9001B",
      500: "#E30613",
      600: "#C70016",
      700: "#A90013",
      800: "#82000F",
      900: "#5E000B",
    },
    secondaryGray: {
      100: "#E0E5F2",
      200: "#E1E9F8",
      300: "#F4F7FE",
      400: "#E9EDF7",
      500: "#8F9BBA",
      600: "#A3AED0",
      700: "#707EAE",
      800: "#707EAE",
      900: "#1B2559",
    },
    red: {
      100: "#FEEFEE",
      500: "#EE5D50",
      600: "#E31A1A",
    },
    blue: {
      50: "#EFF4FB",
      500: "#3965FF",
    },
    orange: {
      100: "#FFF6DA",
      500: "#FFB547",
    },
    green: {
      100: "#E6FAF5",
      500: "#01B574",
    },
    navy: {
      50: "#d0dcfb",
      100: "#aac0fe",
      200: "#a3b9f8",
      300: "#728fea",
      400: "#3652ba",
      500: "#1b3bbb",
      600: "#24388a",
      700: "#1B254B",
      800: "#111c44",
      900: "#0b1437",
    },
    gray: {
      100: "#FAFCFE",
    },
  },
  styles: {
    global: (props) => {
      const appBackground = mode("secondaryGray.300", "navy.900")(props);

      return {
        html: {
          fontFamily: '"Google Sans", sans-serif',
          bg: appBackground,
          backgroundColor: appBackground,
          minH: "100%",
        },
        body: {
          overflowX: "hidden",
          bg: appBackground,
          backgroundColor: appBackground,
          fontFamily: '"Google Sans", sans-serif',
          letterSpacing: "-0.5px",
          minH: "100%",
        },
        "#root": {
          backgroundColor: appBackground,
          minHeight: "100vh",
        },
        input: {
          color: "gray.700",
        },
      };
    },
  },
};
