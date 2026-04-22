'use client';

import * as React from 'react';
import { BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  addWatchlistItem,
  removeWatchlistItem,
} from '@/lib/actions/watchlist.actions';

interface Analyst {
  id: string;
  name: string;
  isWatched: boolean;
}

interface WatchlistDropdownProps {
  symbol: string;
  analysts: Analyst[];
}

export function WatchlistDropdown({ symbol, analysts }: WatchlistDropdownProps) {
  const [state, setState] = React.useState(analysts);

  const anyWatched = state.some((a) => a.isWatched);
  const Icon = anyWatched ? BookmarkCheck : BookmarkPlus;

  function handleToggle(analystId: string, checked: boolean) {
    setState((prev) =>
      prev.map((a) => (a.id === analystId ? { ...a, isWatched: checked } : a)),
    );

    if (checked) {
      addWatchlistItem(analystId, symbol).catch(console.error);
    } else {
      removeWatchlistItem(analystId, symbol).catch(console.error);
    }
  }

  if (analysts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Watchlists</DropdownMenuLabel>
          {state.map((analyst) => (
            <DropdownMenuCheckboxItem
              key={analyst.id}
              checked={analyst.isWatched}
              onCheckedChange={(checked) => handleToggle(analyst.id, !!checked)}
            >
              {analyst.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
