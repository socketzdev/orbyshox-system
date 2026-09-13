import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAdminToken } from '@/lib/auth';

export interface Notification {
  id: string;
  type: 'payment_failed' | 'new_ticket' | 'trial_expiring' | 'new_client';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  link?: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'mock-1',
    type: 'new_ticket',
    title: 'Novo chamado aberto',
    message: 'Restaurante São João abriu um ticket sobre integração TEF.',
    timestamp: 'Há 5 minutos',
    isRead: false,
    link: '/tickets',
  },
  {
    id: 'mock-2',
    type: 'payment_failed',
    title: 'Pagamento falhou',
    message: 'A fatura #FAT-002341 da Barbearia Don Corleone não foi paga.',
    timestamp: 'Há 2 horas',
    isRead: false,
    link: '/billing/invoices',
  },
];

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [unreadCount, setUnreadCount] = useState(MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const socketInstance = io(`${apiUrl}/notifications`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
    });

    setSocket(socketInstance);

    socketInstance.on('notification', (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    socketInstance.on('connect_error', () => {});

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    socket?.emit('mark-all-read');
  }, [socket]);

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(updated.filter((n) => !n.isRead).length);
        return updated;
      });
      socket?.emit('mark-read', id);
    },
    [socket],
  );

  return {
    notifications,
    unreadCount,
    markAllRead,
    markRead,
  };
}
