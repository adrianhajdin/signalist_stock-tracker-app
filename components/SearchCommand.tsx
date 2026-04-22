"use client"

import { useEffect, useState } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { StockLogo } from "@/components/StockLogo"
import { Loader2, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { searchStocks } from "@/lib/actions/finnhub.actions"
import { useDebounce } from "@/hooks/useDebounce"

export default function SearchCommand({ renderAs = 'button', label = 'Add stock', initialStocks }: SearchCommandProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>(initialStocks)
  const router = useRouter()

  const isSearchMode = !!searchTerm.trim()
  const displayStocks = isSearchMode ? stocks : stocks?.slice(0, 10)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const handleSearch = async () => {
    if (!isSearchMode) return setStocks(initialStocks)

    setLoading(true)
    try {
      const results = await searchStocks(searchTerm.trim())
      setStocks(results)
    } catch {
      setStocks([])
    } finally {
      setLoading(false)
    }
  }

  const debouncedSearch = useDebounce(handleSearch, 300)

  useEffect(() => {
    debouncedSearch()
  }, [searchTerm])

  const handleSelectStock = (symbol: string) => {
    setOpen(false)
    setSearchTerm("")
    setStocks(initialStocks)
    router.push(`/stocks/${symbol}`)
  }

  return (
    <>
      {renderAs === 'text' ? (
        <span onClick={() => setOpen(true)} className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
          {label}
        </span>
      ) : renderAs === 'icon' ? (
        <>
          {/* Mobile: ghost icon button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(true)}
            className="md:hidden"
          >
            <Search className="h-4 w-4" />
          </Button>
          {/* Desktop: full search bar */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="hidden md:flex w-full max-w-xs gap-2 rounded-md bg-muted/50 text-sm text-muted-foreground hover:bg-muted"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search stocks</span>
            <Kbd>⌘K</Kbd>
          </Button>
        </>
      ) : (
        <Button onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      <CommandDialog open={open} onOpenChange={setOpen}>
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
          ) : displayStocks?.length === 0 ? (
            <CommandEmpty>
              {isSearchMode ? "No results found" : "No stocks available"}
            </CommandEmpty>
          ) : (
            <CommandGroup heading={`${isSearchMode ? "Search results" : "Popular stocks"} (${displayStocks?.length || 0})`}>
              {displayStocks?.map((stock) => (
                <CommandItem
                  key={stock.symbol}
                  value={`${stock.symbol} ${stock.name}`}
                  onSelect={() => handleSelectStock(stock.symbol)}
                >
                  <StockLogo ticker={stock.symbol} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{stock.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {stock.symbol} | {stock.exchange} | {stock.type}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
