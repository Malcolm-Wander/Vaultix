import { useCallback, useEffect } from 'react';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { EscrowSocketEvent, WebSocketStatus } from '@/lib/websocket';

export interface UseEscrowEventsReturn {
  status: WebSocketStatus;
  joinEscrowRoom: (escrowId: string) => void;
  leaveEscrowRoom: (escrowId: string) => void;
  onEscrowEvent: (
    event: EscrowSocketEvent,
    handler: (payload: Record<string, unknown>) => void,
  ) => () => void;
}

export const useEscrowEvents = (escrowId: string | null): UseEscrowEventsReturn => {
  const {
    status,
    joinEscrowRoom,
    leaveEscrowRoom,
    onEscrowEvent: rawOnEscrowEvent,
    offEscrowEvent,
  } = useWebSocket();

  useEffect(() => {
    if (!escrowId) {
      return;
    }

    joinEscrowRoom(escrowId);
    return () => {
      leaveEscrowRoom(escrowId);
    };
  }, [escrowId, joinEscrowRoom, leaveEscrowRoom]);

  const onEscrowEvent = useCallback(
    (event: EscrowSocketEvent, handler: (payload: Record<string, unknown>) => void) => {
      rawOnEscrowEvent(event, handler);
      return () => {
        offEscrowEvent(event, handler);
      };
    },
    [offEscrowEvent, rawOnEscrowEvent],
  );

  return {
    status,
    joinEscrowRoom,
    leaveEscrowRoom,
    onEscrowEvent,
  };
};
