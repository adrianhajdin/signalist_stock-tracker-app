"use client";

import { useState, useEffect } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { StockLogo } from "@/components/StockLogo";
import { Loader2, Plus } from "lucide-react";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { useDebounce } from "@/hooks/useDebounce";

interface StockComboboxProps {
  onSelect: (symbol: string) => void;
  excludeSymbols?: string[];
}

export function StockCombobox({ onSelect, excludeSymbols = [] }: StockComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>([]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setStocks([]);
      return;
    }
    setLoading(true);
    try {
      const results = await searchStocks(searchTerm.trim());
      setStocks(results.filter((s) => !excludeSymbols.includes(s.symbol)));
    } catch {
      setStocks([]);
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearch = useDebounce(handleSearch, 300);

  useEffect(() => {
    debouncedSearch();
  }, [searchTerm]);

  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    setOpen(false);
    setSearchTerm("");
    setStocks([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus />
            Add stock
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={4}>
        <Command shouldFilter={false}>
          <CommandInput
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Search stocks..."
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : stocks.length === 0 ? (
              <CommandEmpty>
                {searchTerm.trim() ? "No results found" : "Type to search stocks"}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {stocks.map((stock) => (
                  <CommandItem
                    key={stock.symbol}
                    value={stock.symbol}
                    onSelect={() => handleSelect(stock.symbol)}
                  >
                    <StockLogo ticker={stock.symbol} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{stock.symbol}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {stock.name}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
