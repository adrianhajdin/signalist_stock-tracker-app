'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';

// Add stock to watchlist
// ✅ 新增這一行（路徑依你實際檔案位置調整）
import { getStocksDetails } from '@/lib/actions/finnhub.actions';
import { revalidatePath } from 'next/cache';
import { auth } from '../better-auth/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];

  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB connection not found');

    // Better Auth stores users in the "user" collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({ email });

    if (!user) return [];

    const userId = (user.id as string) || String(user._id || '');
    if (!userId) return [];

    const items = await Watchlist.find({ userId }, { symbol: 1 }).lean();
    return items.map((i) => String(i.symbol));
  } catch (err) {
    console.error('getWatchlistSymbolsByEmail error:', err);
    return [];
  }
}

// Add stock to watchlist
export const addToWatchlist = async (symbol: string, company: string) => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect('/sign-in');

    // Check if stock already exists in watchlist
    const existingItem = await Watchlist.findOne({
      userId: session.user.id,
      symbol: symbol.toUpperCase(),
    });

    if (existingItem) {
      return { success: false, error: 'Stock already in watchlist' };
    }

    // Add to watchlist
    const newItem = new Watchlist({
      userId: session.user.id,
      symbol: symbol.toUpperCase(),
      company: company.trim(),
    });

    await newItem.save();
    revalidatePath('/watchlist');

    return { success: true, message: 'Stock added to watchlist' };
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    throw new Error('Failed to add stock to watchlist');
  }
};

// Remove stock from watchlist
export const removeFromWatchlist = async (symbol: string) => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect('/sign-in');

    // Remove from watchlist
    await Watchlist.deleteOne({
      userId: session.user.id,
      symbol: symbol.toUpperCase(),
    });
    revalidatePath('/watchlist');

    return { success: true, message: 'Stock removed from watchlist' };
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    throw new Error('Failed to remove stock from watchlist');
  }
};

// Get user's watchlist
export const getUserWatchlist = async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect('/sign-in');

    const watchlist = await Watchlist.find({ userId: session.user.id })
      .sort({ addedAt: -1 })
      .lean();

    return JSON.parse(JSON.stringify(watchlist));
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    throw new Error('Failed to fetch watchlist');
  }
}

// Get user's watchlist with stock data
export const getWatchlistWithData = async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) redirect('/sign-in');

    const watchlist = await Watchlist.find({ userId: session.user.id }).sort({ addedAt: -1 }).lean();

    if (watchlist.length === 0) return [];

     const stocksWithData = await Promise.all(
      watchlist.map(async (item) => {
        const symbol = String(item.symbol).toUpperCase();

        // ✅ 對 .TW 結尾的台股、台灣 ETF 先特別處理，避免 Finnhub 403 打爆整個列表
        if (symbol.endsWith('.TW')) {
          console.warn(
            `No Finnhub access for TW symbol on current plan: ${symbol}`,
          );
          return {
            company: item.company,
            symbol,
            currentPrice: null,
            priceFormatted: '—',
            changeFormatted: '—',
            changePercent: 0,
            marketCap: '—',
            peRatio: '—',
          };
        }

        // 其它市場正常走 Finnhub
        const stockData = await getStocksDetails(symbol);

        if (!stockData) {
          console.warn(`Failed to fetch data for ${symbol}`);
          return {
            company: item.company,
            symbol,
            currentPrice: null,
            priceFormatted: '—',
            changeFormatted: '—',
            changePercent: 0,
            marketCap: '—',
            peRatio: '—',
          };
        }

        return {
          company: stockData.company,
          symbol: stockData.symbol,
          currentPrice: stockData.currentPrice,
          priceFormatted: stockData.priceFormatted,
          changeFormatted: stockData.changeFormatted,
          changePercent: stockData.changePercent,
          marketCap: stockData.marketCapFormatted,
          peRatio: stockData.peRatio,
        };
      }),
    );

    return JSON.parse(JSON.stringify(stocksWithData));
  } catch (error) {
    console.error('Error loading watchlist:', error);
    throw new Error('Failed to fetch watchlist');
  }
};