import React from 'react';

import { Icon } from '@chakra-ui/react';
import {
  MdBarChart,
  MdLink,
} from 'react-icons/md';

// Admin Imports
import AnalyticsPage from 'views/admin/analytics';
import UtmPage from 'views/admin/utm';

const routes = [
  {
    name: 'Статистика',
    layout: '/admin',
    path: '/statistics',
    icon: <Icon as={MdBarChart} width="20px" height="20px" color="inherit" />,
    component: <AnalyticsPage />,
  },
  {
    name: 'UTM',
    layout: '/admin',
    path: '/utm',
    icon: <Icon as={MdLink} width="20px" height="20px" color="inherit" />,
    component: <UtmPage />,
  },
];

export default routes;
