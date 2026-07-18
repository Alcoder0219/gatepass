import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { getAccessToken } from '@/services/api';
import type { Notification } from '@/types';

/** Must match `backend/src/constants/index.js` → SOCKET_EVENT. */
export const SOCKET_EVENT = {
  NOTIFICATION: 'notification:new',
  GATEPASS_UPDATED: 'gatepass:updated',
  GATEPASS_CREATED: 'gatepass:created',
  ACTIVITY: 'activity:new',
  DASHBOARD_REFRESH: 'dashboard:refresh',
} as const;

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  /* Keyed on the user IDENTITY, not the user OBJECT.
   *
   * This effect used to depend on `user`, which AuthContext replaces with a new
   * object on every refreshUser()/profile save. Each of those tore down a
   * perfectly healthy WebSocket and opened a fresh one — reconnect churn that
   * re-registered every handler and re-fired the invalidations below, which is a
   * large part of why API calls appeared to fire several times over.
   * Only a genuine change of *who is signed in* should rebuild the connection. */
  const userId = user?._id ?? null;

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      return undefined;
    }

    const socket = io(import.meta.env.VITE_SOCKET_URL ?? window.location.origin, {
      auth: { token: getAccessToken() },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    // Held in state as well as a ref: the context value must change identity when
    // the socket is replaced, or consumers keep a dead one.
    setSocket(socket);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', () => setIsConnected(false));

    // A new notification: toast it AND fold it into the cached list, so the bell
    // count and the dropdown update without a refetch round-trip.
    socket.on(SOCKET_EVENT.NOTIFICATION, (notification: Notification) => {
      toast.custom(
        (t) => (
          <div
            className={`card pointer-events-auto flex max-w-sm gap-3 p-4 ${
              t.visible ? 'animate-slide-up' : 'opacity-0'
            }`}
          >
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content">{notification.title}</p>
              <p className="mt-0.5 text-xs text-content-muted">{notification.message}</p>
            </div>
          </div>
        ),
        { duration: 5000, position: 'top-right' }
      );

      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    });

    // Any workflow movement invalidates the lists and dashboards that show it.
    const invalidateWorkflow = () => {
      void queryClient.invalidateQueries({ queryKey: ['gate-passes'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['hr'] });
      void queryClient.invalidateQueries({ queryKey: ['security'] });
    };

    socket.on(SOCKET_EVENT.GATEPASS_UPDATED, invalidateWorkflow);
    socket.on(SOCKET_EVENT.GATEPASS_CREATED, invalidateWorkflow);
    socket.on(SOCKET_EVENT.DASHBOARD_REFRESH, () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    return () => {
      // removeAllListeners before disconnect: socket.io retains handler arrays on
      // the instance, and the closures here capture queryClient. Without this the
      // old instance stays reachable from its own listeners after a reconnect.
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, userId, queryClient]);

  const value = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);
