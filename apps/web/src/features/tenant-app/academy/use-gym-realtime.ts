import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getAdminToken, getTenantToken } from '@/lib/auth';

/**
 * Tempo real da academia (namespace /gym, sala por empresa).
 *
 * Cada evento invalida as queries do tópico — qualquer tela aberta (recepção,
 * professor, TV do salão) atualiza sozinha, sem F5 e sem polling extra.
 * O polling existente nas páginas continua como redundância caso o socket caia.
 */

export type GymTopic =
  | 'students'
  | 'enrollments'
  | 'checkins'
  | 'workouts'
  | 'exercises'
  | 'classes'
  | 'assessments'
  | 'dashboard';

const TOPIC_KEYS: Record<GymTopic, string[]> = {
  students: ['gym-students', 'gym-student', 'gym-dashboard'],
  enrollments: ['gym-enrollments', 'gym-students', 'gym-dashboard'],
  checkins: ['gym-checkins-today', 'gym-dashboard'],
  workouts: ['gym-workouts', 'gym-workouts-week', 'gym-dashboard'],
  exercises: ['gym-exercises'],
  classes: ['gym-classes', 'gym-dashboard'],
  assessments: ['gym-assessments', 'gym-dashboard'],
  dashboard: ['gym-dashboard'],
};

export function useGymRealtime(enabled = true): { live: boolean } {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const token = getTenantToken() || getAdminToken();
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const socket = io(`${apiUrl}/gym`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('connect_error', () => setLive(false));
    socket.on('gym:update', (msg: { topic?: GymTopic }) => {
      const keys = (msg?.topic && TOPIC_KEYS[msg.topic]) || [];
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    });

    return () => {
      socket.disconnect();
      setLive(false);
    };
  }, [enabled, queryClient]);

  return { live };
}
