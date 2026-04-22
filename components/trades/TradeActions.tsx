'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import { closeTrade, cancelTrade } from '@/lib/actions/closeTrade.actions';

interface TradeActionsProps {
  tradeId: string;
  ticker: string;
  isOpen: boolean;
  runId?: string | null;
}

export function TradeActions({ tradeId, ticker, isOpen, runId }: TradeActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<'close' | 'cancel' | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAction() {
    if (!action) return;
    setLoading(true);
    try {
      if (action === 'close') {
        await closeTrade(tradeId, 'MANUAL');
        toast.success('Trade closed');
      } else {
        await cancelTrade(tradeId);
        toast.success('Order cancelled');
      }
      setAction(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {runId && (
            <DropdownMenuItem onClick={() => window.location.href = `/runs/${runId}`}>
              View run
            </DropdownMenuItem>
          )}
          {isOpen && (
            <>
              {runId && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="text-amber-500 focus:text-amber-500"
                onClick={() => setAction('cancel')}
              >
                Cancel order
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-negative focus:text-negative"
                onClick={() => setAction('close')}
              >
                Close trade
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={!!action}
        onOpenChange={(open) => { if (!open) setAction(null); }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {action === 'cancel' ? 'Cancel Order' : 'Close Trade'} — {ticker}
            </DialogTitle>
            <DialogDescription>
              {action === 'cancel'
                ? 'This will cancel the pending Alpaca order and mark the trade as cancelled. Use this for orders that haven\'t been filled yet.'
                : 'This will close the position at the current market price. The realized P&L will be recorded. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAction(null)}
              disabled={loading}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAction}
              disabled={loading}
              className="gap-2"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading
                ? action === 'cancel' ? 'Cancelling…' : 'Closing…'
                : action === 'cancel' ? 'Cancel Order' : 'Close Trade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
