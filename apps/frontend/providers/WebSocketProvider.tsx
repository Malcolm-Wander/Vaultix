'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';
import {
  createEscrowWebSocket,
  EscrowSocketEvent,
  WebSocketStatus,
  getStoredAuthToken,
} from '@/lib/websocket';

interface WebSocketContextValue {
  socket: Socket | null;
  status: WebSocketStatus;
  connect: () => void;
  disconnect: () => void;
  joinEscrowRoom: (escrowId: string) => void;
  leaveEscrowRoom: (escrowId: string) => void;
  onEscrowEvent: (
    event: EscrowSocketEvent,
    handler: (payload: Record<string, unknown>) => void,
  ) => void;
  offEscrowEvent: (
    event: EscrowSocketEvent,
    handler?: (payload: Record<string, unknown>) => void,
  ) => void;
  onNotification: (
    handler: (payload: Record<string, unknown>) => void,
  ) => void;
  offNotification: (
    handler?: (payload: Record<string, unknown>) => void,
  ) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);
const AUTH_TOKEN_KEY = 'authToken';

export const WebSocketProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const escrowListenersRef = useRef<
    Map<EscrowSocketEvent, Set<(payload: Record<string, unknown>) => void>>
  >(new Map());
  const notificationListenersRef = useRef<
    Set<(payload: Record<string, unknown>) => void>
  >(new Set());

  const attachListeners = useCallback((socket: Socket) => {
    escrowListenersRef.current.forEach((handlers, event) => {
      handlers.forEach((handler) => socket.on(event, handler));
    });
    notificationListenersRef.current.forEach((handler) =>
      socket.on('notification:new', handler),
    );
  }, []);

  const detachListeners = useCallback((socket: Socket) => {
    escrowListenersRef.current.forEach((handlers, event) => {
      handlers.forEach((handler) => socket.off(event, handler));
    });
    notificationListenersRef.current.forEach((handler) =>
      socket.off('notification:new', handler),
    );
  }, []);

  const updateStoredToken = useCallback(() => {
    if (typeof window === 'undefined') return;
    setAuthToken(window.localStorage.getItem(AUTH_TOKEN_KEY));
  }, []);

  useEffect(() => {
    updateStoredToken();

    if (typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_TOKEN_KEY) {
        setAuthToken(event.newValue);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateStoredToken();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    const pollToken = window.setInterval(() => {
      const latestToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (latestToken !== authToken) {
        setAuthToken(latestToken);
      }
    }, 5000);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(pollToken);
    };
  }, [authToken, updateStoredToken]);

  useEffect(() => {
    const token = authToken ?? getStoredAuthToken();

    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setStatus('disconnected');
      tokenRef.current = null;
      return;
    }

    if (tokenRef.current === token && socketRef.current) {
      return;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    tokenRef.current = token;
    const socket = createEscrowWebSocket(token);
    socketRef.current = socket;

    const handleConnect = () => setStatus('connected');
    const handleReconnect = () => setStatus('reconnecting');
    const handleDisconnect = () => setStatus('disconnected');
    const handleError = () => setStatus('error');

    attachListeners(socket);
    socket.on('connect', handleConnect);
    socket.on('reconnect_attempt', handleReconnect);
    socket.on('reconnect_error', handleError);
    socket.on('connect_error', handleError);
    socket.on('disconnect', handleDisconnect);

    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('reconnect_attempt', handleReconnect);
      socket.off('reconnect_error', handleError);
      socket.off('connect_error', handleError);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
      tokenRef.current = null;
    }
  }, []);

  const joinEscrowRoom = useCallback((escrowId: string) => {
    socketRef.current?.emit('joinEscrow', escrowId);
  }, []);

  const leaveEscrowRoom = useCallback((escrowId: string) => {
    socketRef.current?.emit('leaveEscrow', escrowId);
  }, []);

  const onEscrowEvent = useCallback(
    (
      event: EscrowSocketEvent,
      handler: (payload: Record<string, unknown>) => void,
    ) => {
      const handlers = escrowListenersRef.current.get(event) ?? new Set();
      handlers.add(handler);
      escrowListenersRef.current.set(event, handlers);
      socketRef.current?.on(event, handler);
    },
    [],
  );

  const offEscrowEvent = useCallback(
    (
      event: EscrowSocketEvent,
      handler?: (payload: Record<string, unknown>) => void,
    ) => {
      const handlers = escrowListenersRef.current.get(event);
      if (!handlers) {
        return;
      }
      if (handler) {
        handlers.delete(handler);
        socketRef.current?.off(event, handler);
      } else {
        handlers.forEach((listener) => socketRef.current?.off(event, listener));
        handlers.clear();
      }
      if (handlers.size === 0) {
        escrowListenersRef.current.delete(event);
      }
    },
    [],
  );

  const onNotification = useCallback(
    (handler: (payload: Record<string, unknown>) => void) => {
      notificationListenersRef.current.add(handler);
      socketRef.current?.on('notification:new', handler);
    },
    [],
  );

  const offNotification = useCallback(
    (handler?: (payload: Record<string, unknown>) => void) => {
      if (handler) {
        notificationListenersRef.current.delete(handler);
        socketRef.current?.off('notification:new', handler);
      } else {
        notificationListenersRef.current.forEach((listener) =>
          socketRef.current?.off('notification:new', listener),
        );
        notificationListenersRef.current.clear();
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      status,
      connect,
      disconnect,
      joinEscrowRoom,
      leaveEscrowRoom,
      onEscrowEvent,
      offEscrowEvent,
      onNotification,
      offNotification,
    }),
    [status, connect, disconnect, joinEscrowRoom, leaveEscrowRoom, onEscrowEvent, offEscrowEvent, onNotification, offNotification],
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
