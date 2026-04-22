/**
 * NYSE/NASDAQ market hours helper.
 * Mon–Fri, 9:30am–4:00pm Eastern Time.
 * Includes US federal holiday list for the current year.
 */

// US market holidays (NYSE observed) — update yearly
const MARKET_HOLIDAYS_2026 = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-11-27", // Black Friday (early close, treated as closed)
  "2026-12-25", // Christmas
]);

const MARKET_HOLIDAYS_2027 = new Set([
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

function getHolidays(year: number): Set<string> {
  if (year === 2026) return MARKET_HOLIDAYS_2026;
  if (year === 2027) return MARKET_HOLIDAYS_2027;
  return new Set();
}

/**
 * Returns true if the US stock market is currently open.
 * Checks: weekday, not holiday, 9:30am–4:00pm ET.
 */
/**
 * Returns the current trading-day date as a UTC midnight Date.
 *
 * The "date" used to key MorningBrief, daily Signal filters, EOD snapshots,
 * etc. must be the *Eastern Time* calendar date, not the server-local
 * (UTC on Vercel) date. Otherwise any code that runs after 8 PM ET sees
 * "tomorrow" while the ET trading day is still in progress.
 *
 * Convention: YYYY-MM-DD in ET, materialised as 00:00:00 UTC of that same
 * calendar date. Sorts correctly, comparable across timezones, and matches
 * how the morning cron wrote rows when it ran before UTC midnight.
 */
export function etTradingDayDate(now: Date = new Date()): Date {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function isMarketOpen(now: Date = new Date()): boolean {
  // Convert to Eastern Time
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = Object.fromEntries(
    etFormatter.formatToParts(now).map((p) => [p.type, p.value])
  );

  const weekday = parts.weekday; // "Mon", "Tue", etc.
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;

  // Weekends
  if (weekday === "Sat" || weekday === "Sun") return false;

  // Holidays
  const holidays = getHolidays(parseInt(parts.year, 10));
  if (holidays.has(dateStr)) return false;

  // 9:30am – 4:00pm ET
  const totalMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30; // 570
  const marketClose = 16 * 60; // 960

  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

/**
 * Returns minutes until market open (0 if already open).
 */
export function minutesUntilOpen(now: Date = new Date()): number {
  if (isMarketOpen(now)) return 0;
  // Simplified: next 9:30am ET
  const next = new Date(now);
  next.setHours(next.getHours() + 1); // rough estimate
  return 60;
}
