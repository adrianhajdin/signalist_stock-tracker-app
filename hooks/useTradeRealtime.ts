"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type RealtimePosition = {
  id: string;
  status: string;
  symbol: string;
  direction: string;
  realizedPnl: number | null;
  closeReason: string | null;
  outcome: string | null;
};

export type RealtimePositionEvent = {
  id: string;
  positionId: string;
  eventType: string;
  description: string;
  priceAt: number | null;
  pnlAt: number | null;
  createdAt: string;
};

interface UsePositionRealtimeOptions {
  userId: string;
  /** Called when a Position row is updated (status change, P&L update, close) */
  onPositionUpdate?: (position: RealtimePosition) => void;
  /** Called when a new PositionEvent is inserted (price check, near target, closed) */
  onPositionEvent?: (event: RealtimePositionEvent) => void;
}

/**
 * Supabase Realtime subscription for Position and PositionEvent tables.
 *
 * PREREQUISITE: Run this in Supabase Dashboard → SQL Editor before this works:
 *   ALTER TABLE "Position" REPLICA IDENTITY FULL;
 *   ALTER TABLE "PositionEvent" REPLICA IDENTITY FULL;
 *   Then add both tables to the realtime publication in
 *   Dashboard → Database → Replication → supabase_realtime → Tables.
 */
export function usePositionRealtime({
  userId,
  onPositionUpdate,
  onPositionEvent,
}: UsePositionRealtimeOptions) {
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handlePositionUpdate = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const row = payload.new;
      onPositionUpdate?.({
        id: row.id as string,
        status: row.status as string,
        symbol: row.symbol as string,
        direction: row.direction as string,
        realizedPnl: row.realizedPnl as number | null,
        closeReason: row.closeReason as string | null,
        outcome: row.outcome as string | null,
      });
    },
    [onPositionUpdate]
  );

  const handlePositionEvent = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const row = payload.new;
      onPositionEvent?.({
        id: row.id as string,
        positionId: row.positionId as string,
        eventType: row.eventType as string,
        description: row.description as string,
        priceAt: row.priceAt as number | null,
        pnlAt: row.pnlAt as number | null,
        createdAt: row.createdAt as string,
      });
    },
    [onPositionEvent]
  );

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`positions-realtime:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Position",
          filter: `userId=eq.${userId}`,
        },
        handlePositionUpdate
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "PositionEvent",
        },
        handlePositionEvent
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, supabase, handlePositionUpdate, handlePositionEvent]);
}

// Legacy alias for backwards compatibility
export const useTradeRealtime = usePositionRealtime;
export type RealtimeTrade = RealtimePosition;
export type RealtimeTradeEvent = RealtimePositionEvent;
