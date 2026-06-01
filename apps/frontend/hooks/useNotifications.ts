import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationService } from '@/services/notification';
import { Notification } from '@/types/notification';
import { useWebSocket } from '@/providers/WebSocketProvider';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: Error | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected' | 'error';
  markAsRead: (notificationId?: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
}

export const useNotifications = (): UseNotificationsReturn => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const notificationsRef = useRef<Notification[]>([]);
  const { onNotification, offNotification, status: connectionStatus } = useWebSocket();

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const [notificationsData, unreadCountData] = await Promise.all([
        notificationService.getNotifications(),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(notificationsData);
      setUnreadCount(unreadCountData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch notifications'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = async (notificationId?: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      await fetchNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAsRead();
      await fetchNotifications();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handleNotification = (payload: Notification) => {
      setNotifications((current) => {
        const exists = current.some((notification) => notification.id === payload.id);
        if (exists) {
          return current.map((notification) =>
            notification.id === payload.id ? payload : notification,
          );
        }
        return [payload, ...current];
      });

      setUnreadCount((current) => {
        const alreadyExists = notificationsRef.current.some(
          (notification) => notification.id === payload.id,
        );
        if (alreadyExists) {
          return current;
        }
        return current + (payload.readAt ? 0 : 1);
      });
    };

    onNotification(handleNotification);

    return () => {
      offNotification(handleNotification);
    };
  }, [fetchNotifications, onNotification, offNotification]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    connectionStatus,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
};
