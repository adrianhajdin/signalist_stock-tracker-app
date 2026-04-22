import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { MarketStatusPill } from "@/components/MarketPulseStrip";
import SearchCommand from "@/components/SearchCommand";
import { DynamicBreadcrumb } from "@/components/DynamicBreadcrumb";
import { createClient } from "@/lib/supabase/server";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { redirect } from "next/navigation";
import { isMarketOpen } from "@/lib/market-hours";
import { prisma } from "@/lib/prisma";
import { getApiKeyStatus } from "@/lib/actions/api-keys.actions";
import { OnboardingShell } from "@/components/domain/onboarding-shell";

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect('/sign-in');

    const userObj = {
        id: user.id,
        name: user.user_metadata?.full_name ?? user.email ?? '',
        email: user.email ?? '',
    };

    // Load open trade tickers, stocks list, and portfolio value at request time
    const [initialStocks, openTrades, pnlAggregate, alpacaStatus] = await Promise.all([
        searchStocks(),
        prisma.position.findMany({
            where: { userId: user.id, status: "OPEN" },
            select: { symbol: true },
            take: 10,
        }),
        prisma.position.aggregate({
            where: { userId: user.id, status: "CLOSED" },
            _sum: { realizedPnl: true },
        }),
        getApiKeyStatus("ALPACA"),
    ]);

    const openTradeTickers = openTrades
        .map((t) => t.symbol)
        .filter((t): t is string => Boolean(t));

    const marketOpen = isMarketOpen();

    // Start from a $100k paper account, add realized P&L
    const portfolioValue = 100_000 + (pnlAggregate._sum.realizedPnl ?? 0);

    const needsName = !user.user_metadata?.full_name;
    const initialFullName = (user.user_metadata?.full_name as string) ?? "";

    return (
        <SidebarProvider>
            <OnboardingShell
                user={userObj}
                initialStocks={initialStocks}
                portfolioValue={portfolioValue}
                openTradeTickers={openTradeTickers}
                needsName={needsName}
                hasAlpacaKey={alpacaStatus.hasKey}
                initialFullName={initialFullName}
            />
            <SidebarInset>
                {/* Top bar — sidebar toggle + search + theme */}
                <header className="flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <div className="flex flex-1 w-full items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <DynamicBreadcrumb />
                        <div className="flex-1 flex items-center md:justify-center justify-end px-0 md:px-2 order-last md:order-none">
                            <SearchCommand renderAs="icon" label="Search stocks" initialStocks={initialStocks} />
                        </div>
                        <MarketStatusPill open={marketOpen} />
                    </div>
                </header>
                <main className="flex-1">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default Layout;
