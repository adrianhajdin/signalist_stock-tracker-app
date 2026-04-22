import { TrendingUp, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function StocksPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Stocks</h1>
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">Search for any stock</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use{" "}
              <kbd className="px-1.5 py-0.5 text-xs bg-secondary border border-border rounded font-mono">
                ⌘K
              </kbd>
              {" "}to open stock search, then click a result to view its detail page.
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            Try: NVDA, TSLA, AAPL, MSFT
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
