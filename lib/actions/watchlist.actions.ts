'use server';

import { prisma } from '@/lib/prisma';

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { watchlist: { select: { symbol: true } } },
    });
    return user?.watchlist.map((w) => w.symbol) ?? [];
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}
