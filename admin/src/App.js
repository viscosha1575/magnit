import './assets/css/App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import AdminLayout from './layouts/admin';
import initialTheme from './theme/theme';

export default function Main() {
  return (
    <ChakraProvider theme={initialTheme}>
      <Routes>
        <Route path="admin/*" element={<AdminLayout />} />
        <Route path="/" element={<Navigate to="/admin/statistics" replace />} />
        <Route path="*" element={<Navigate to="/admin/statistics" replace />} />
      </Routes>
    </ChakraProvider>
  );
}

