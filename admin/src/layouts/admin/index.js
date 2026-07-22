// Chakra imports
import { Portal, Box, useDisclosure } from '@chakra-ui/react';
// Layout components
import Navbar from 'components/navbar/NavbarAdmin.js';
import MobileBottomNav from 'components/navigation/MobileBottomNav.js';
import Sidebar from 'components/sidebar/Sidebar.js';
import { SidebarContext } from 'contexts/SidebarContext';
import React, { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import routes from 'routes.js';

const ADMIN_SAFE_AREA_TOP = 'var(--admin-safe-area-top, 0px)';
const ADMIN_SAFE_AREA_RIGHT = 'var(--admin-safe-area-right, 0px)';
const ADMIN_SAFE_AREA_BOTTOM = 'var(--admin-safe-area-bottom, 0px)';
const ADMIN_SAFE_AREA_LEFT = 'var(--admin-safe-area-left, 0px)';

// Custom Chakra theme
export default function Dashboard(props) {
  const { admin, ...rest } = props;
  const location = useLocation();
  const currentPath = location.pathname;
  // states and functions
  const [fixed] = useState(false);
  const [toggleSidebar, setToggleSidebar] = useState(false);
  // functions for changing the states from components
  const getRoute = () => {
    return true;
  };
  const getActiveRoute = (routes) => {
    let activeRoute = 'Админка';
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].collapse) {
        let collapseActiveRoute = getActiveRoute(routes[i].items);
        if (collapseActiveRoute !== activeRoute) {
          return collapseActiveRoute;
        }
      } else if (routes[i].category) {
        let categoryActiveRoute = getActiveRoute(routes[i].items);
        if (categoryActiveRoute !== activeRoute) {
          return categoryActiveRoute;
        }
      } else {
        if (currentPath.includes(routes[i].layout + routes[i].path)) {
          return routes[i].name;
        }
      }
    }
    return activeRoute;
  };
  const getActiveNavbar = (routes) => {
    let activeNavbar = false;
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].collapse) {
        let collapseActiveNavbar = getActiveNavbar(routes[i].items);
        if (collapseActiveNavbar !== activeNavbar) {
          return collapseActiveNavbar;
        }
      } else if (routes[i].category) {
        let categoryActiveNavbar = getActiveNavbar(routes[i].items);
        if (categoryActiveNavbar !== activeNavbar) {
          return categoryActiveNavbar;
        }
      } else {
        if (currentPath.includes(routes[i].layout + routes[i].path)) {
          return routes[i].secondary;
        }
      }
    }
    return activeNavbar;
  };
  const getActiveNavbarText = (routes) => {
    let activeNavbar = false;
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].collapse) {
        let collapseActiveNavbar = getActiveNavbarText(routes[i].items);
        if (collapseActiveNavbar !== activeNavbar) {
          return collapseActiveNavbar;
        }
      } else if (routes[i].category) {
        let categoryActiveNavbar = getActiveNavbarText(routes[i].items);
        if (categoryActiveNavbar !== activeNavbar) {
          return categoryActiveNavbar;
        }
      } else {
        if (currentPath.includes(routes[i].layout + routes[i].path)) {
          return routes[i].messageNavbar;
        }
      }
    }
    return activeNavbar;
  };
  const getRoutes = (routes) => {
    return routes.map((route, key) => {
      if (route.layout === '/admin') {
        return (
          <Route path={`${route.path}`} element={route.component} key={key} />
        );
      }
      if (route.collapse) {
        return getRoutes(route.items);
      } else {
        return null;
      }
    });
  };
  document.documentElement.dir = 'ltr';
  const { onOpen } = useDisclosure();
  document.documentElement.dir = 'ltr';
  return (
    <Box>
      <Box>
        <SidebarContext.Provider
          value={{
            toggleSidebar,
            setToggleSidebar,
          }}
        >
          <Sidebar routes={routes} display="none" {...rest} />
          <Box
            float="right"
            minHeight="100vh"
            height="100%"
            overflow="auto"
            position="relative"
            maxHeight="100%"
            w={{ base: '100%', xl: 'calc( 100% - 290px )' }}
            maxWidth={{ base: '100%', xl: 'calc( 100% - 290px )' }}
            transition="all 0.33s cubic-bezier(0.685, 0.0473, 0.346, 1)"
            transitionDuration=".2s, .2s, .35s"
            transitionProperty="top, bottom, width"
            transitionTimingFunction="linear, linear, ease"
          >
            <Portal>
              <Box>
                <Navbar
                  onOpen={onOpen}
                  admin={admin}
                  brandText={getActiveRoute(routes)}
                  secondary={getActiveNavbar(routes)}
                  message={getActiveNavbarText(routes)}
                  fixed={fixed}
                  {...rest}
                />
              </Box>
            </Portal>

            {getRoute() ? (
              <Box
                mx="auto"
                pl={{
                  base: `calc(14px + ${ADMIN_SAFE_AREA_LEFT})`,
                  md: '24px',
                  xl: '30px'
                }}
                pr={{
                  base: `calc(14px + ${ADMIN_SAFE_AREA_RIGHT})`,
                  md: '24px',
                  xl: '20px'
                }}
                pb={{
                  base: `calc(96px + ${ADMIN_SAFE_AREA_BOTTOM})`,
                  md: '24px',
                  xl: '30px'
                }}
                minH="100vh"
                pt={{
                  base: `calc(104px + ${ADMIN_SAFE_AREA_TOP})`,
                  md: '92px',
                  xl: '50px'
                }}
              >
                <Routes>
                  {getRoutes(routes)}
                  <Route
                    index
                    element={<Navigate to="/admin/statistics" replace />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/admin/statistics" replace />}
                  />
                </Routes>
              </Box>
            ) : null}
            <MobileBottomNav routes={routes} />
          </Box>
        </SidebarContext.Provider>
      </Box>
    </Box>
  );
}
