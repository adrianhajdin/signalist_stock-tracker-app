"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Map route segments to display labels */
const ROUTE_LABELS: Record<string, string> = {
  analysts: "Analysts",
  runs: "Runs",
  trades: "Trades",
  performance: "Performance",
  stocks: "Stocks",
  settings: "Settings",
  new: "New",
  edit: "Edit",
};

export function DynamicBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Dashboard — no breadcrumb needed
  if (segments.length === 0) return null;

  const crumbs: Array<{ label: string; href: string }> = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");

    // Named route
    if (ROUTE_LABELS[segment]) {
      crumbs.push({ label: ROUTE_LABELS[segment], href });
    }
    // Stock symbol (all caps, under /stocks/)
    else if (segments[i - 1] === "stocks" && /^[A-Z]+$/.test(segment)) {
      crumbs.push({ label: `$${segment}`, href });
    }
    // Dynamic segment (UUID or ID) — skip, the parent label is enough
    // unless it's the last segment, in which case show nothing extra
  }

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.flatMap((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          const items = [];
          if (i > 0) items.push(<BreadcrumbSeparator key={`sep-${i}`} />);
          items.push(
            <BreadcrumbItem key={crumb.href}>
              {isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
          return items;
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
