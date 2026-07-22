import './assets/css/App.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, Button, ChakraProvider, Spinner, Text, VStack } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import AdminLayout from './layouts/admin';
import initialTheme from './theme/theme';
import { apiFetch, setTelegramInitData } from './api';
import { getTelegramWebApp } from './telegram';

function TelegramAdminGate({ children }) {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setMessage('');
    getTelegramWebApp()
      .then(async ({ initData, isLocalBypass }) => {
        if (cancelled) return;
        if (isLocalBypass) {
          setStatus('allowed');
          return;
        }
        setTelegramInitData(initData);
        const response = await apiFetch('/api/auth/me');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Доступ запрещён');
        if (!cancelled) setStatus('allowed');
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error.message || 'Не удалось проверить доступ');
          setStatus('denied');
        }
      });
    return () => { cancelled = true; };
  }, [attempt]);

  if (status === 'allowed') return children;
  return (
    <Box minH="100vh" display="grid" placeItems="center" bg="#f7f8fc" p="24px">
      <VStack spacing="16px" maxW="480px" textAlign="center">
        {status === 'loading' ? <Spinner color="#E5001C" size="xl" thickness="4px" /> : null}
        <Text fontSize="2xl" fontWeight="700" color="#20284f">
          {status === 'loading' ? 'Проверяем доступ…' : 'Доступ к админке закрыт'}
        </Text>
        {message ? <Text color="gray.600">{message}</Text> : null}
        {status === 'denied' ? (
          <Button colorScheme="brand" onClick={() => setAttempt((value) => value + 1)}>Повторить</Button>
        ) : null}
      </VStack>
    </Box>
  );
}

export default function Main() {
  return (
    <ChakraProvider theme={initialTheme}>
      <TelegramAdminGate>
        <Routes>
          <Route path="admin/*" element={<AdminLayout />} />
          <Route path="/" element={<Navigate to="/admin/statistics" replace />} />
          <Route path="*" element={<Navigate to="/admin/statistics" replace />} />
        </Routes>
      </TelegramAdminGate>
    </ChakraProvider>
  );
}
