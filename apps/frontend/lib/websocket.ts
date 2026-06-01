import { io, Socket } from 'socket.io-client';

export type EscrowSocketEvent =
  | 'escrow:status_changed'
  | 'escrow:funded'
  | 'escrow:completed'
  | 'escrow:milestone_released'
  | 'escrow:condition_fulfilled'
  | 'escrow:condition_confirmed'
  | 'escrow:dispute_filed'
  | 'escrow:dispute_resolved'
  | 'escrow:party_joined'
  | 'escrow:cancelled';

export type NotificationSocketEvent = 'notification:new';

export type SocketEvent = EscrowSocketEvent | NotificationSocketEvent;

export type WebSocketStatus = 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface WebSocketEventPayload {
  [key: string]: unknown;
}

const AUTH_TOKEN_KEY = 'authToken';
const DEFAULT_API_URL = 'http://localhost:3000';
const ESCROW_NAMESPACE = '/escrow';

export const getWebSocketUrl = (): string => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  return `${baseUrl.replace(/\/$/, '')}${ESCROW_NAMESPACE}`;
};

export const createEscrowWebSocket = (token: string): Socket => {
  return io(getWebSocketUrl(), {
    auth: { token },
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
};

export const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
};
