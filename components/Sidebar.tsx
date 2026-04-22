'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  Bot,
  PlayCircle,
  ArrowLeftRight,
  BarChart3,
  Settings,
  LogOut,
  ChevronsUpDown,
  Wallet,
  Sun,
  Moon,
  Workflow,
  SatelliteDish,
  Sparkles,
} from 'lucide-react';
import HindsightLogo from '@/components/HindsightLogo';
import { SidebarMarquee } from '@/components/MarketPulseStrip';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/actions/auth.actions';

const MAIN_NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, tooltip: 'Portfolio overview' },
  { href: '/analysts', label: 'Analysts', icon: Bot, tooltip: 'AI trading personas' },
  { href: '/runs', label: 'Runs', icon: PlayCircle, tooltip: 'Research sessions' },
  { href: '/intelligence', label: 'Intelligence', icon: SatelliteDish, tooltip: 'Signals, monitors, briefs' },
];

const PORTFOLIO_NAV = [
  { href: '/trades', label: 'Trades', icon: ArrowLeftRight, tooltip: 'Paper trades and P&L' },
  { href: '/performance', label: 'Performance', icon: BarChart3, tooltip: 'Win rate and accuracy' },
];

export default function AppSidebar({
  user,
  initialStocks,
  portfolioValue,
  openTradeTickers = [],
  onProductTour,
}: {
  user: User;
  initialStocks: StockWithWatchlistStatus[];
  portfolioValue: number;
  openTradeTickers?: string[];
  onProductTour?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/sign-in');
  };

  const formattedPortfolio = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(portfolioValue);

  const isDark = theme === 'dark';

  return (
    <Sidebar collapsible="icon">
      {/* Brand */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <HindsightLogo className="size-5 shrink-0 text-brand" />
              <span className="font-semibold tracking-tight">Hindsight</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <TooltipProvider delay={400}>
          {/* Main nav */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {MAIN_NAV.map(({ href, label, icon: Icon, tooltip }) => (
                  <SidebarMenuItem key={href}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            render={<Link href={href} />}
                            isActive={isActive(href)}
                            onClick={() => isMobile && setOpenMobile(false)}
                          >
                            <Icon />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        }
                      />
                      <TooltipContent side="right">
                        <p className="text-xs">{tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Portfolio group */}
          <SidebarGroup>
            <SidebarGroupLabel>Portfolio</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {PORTFOLIO_NAV.map(({ href, label, icon: Icon, tooltip }) => (
                  <SidebarMenuItem key={href}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            render={<Link href={href} />}
                            isActive={isActive(href)}
                            onClick={() => isMobile && setOpenMobile(false)}
                          >
                            <Icon />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        }
                      />
                      <TooltipContent side="right">
                        <p className="text-xs">{tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </TooltipProvider>
      </SidebarContent>

      {/* Ticker marquee — above user footer */}
      <SidebarMarquee openTradeTickers={openTradeTickers} />

      {/* User footer — clickable dropdown */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" />}
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              >
                <Avatar className="h-7 w-7 rounded-md shrink-0">
                  <AvatarFallback className="rounded-md text-xs bg-brand text-brand-foreground font-semibold">
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left overflow-hidden">
                  <p className="text-xs font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                {/* Portfolio value — DropdownMenuLabel is Menu.GroupLabel which requires Menu.Group wrapper */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" />
                      <span>Portfolio</span>
                      <span className="ml-auto font-semibold text-foreground tabular-nums">
                        {formattedPortfolio}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />

                {/* Settings — onClick only, no render={<Link>} to avoid Base UI / Next router conflict */}
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => router.push('/agent-workflow')}>
                  <Workflow className="h-3.5 w-3.5" />
                  Agent Workflow
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onProductTour?.()}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Product Tour
                </DropdownMenuItem>

                {/* Theme toggle */}
                <DropdownMenuItem onClick={() => setTheme(isDark ? 'light' : 'dark')}>
                  {isDark ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                  {isDark ? 'Light mode' : 'Dark mode'}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
