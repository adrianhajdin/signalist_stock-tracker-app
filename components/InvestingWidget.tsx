'use client';

import { useEffect, useRef } from 'react';

interface InvestingWidgetProps {
  symbol: string;
}

// Map common Taiwan stock symbols to Investing.com IDs
const INVESTING_SYMBOL_MAP: Record<string, string> = {
  '2330.TW': '44082',  // TSMC
  '0050.TW': '44067',  // Taiwan 50 ETF
  '0052.TW': '1031220', // Yuanta Taiwan Technology ETF
  '2317.TW': '44069',  // Hon Hai
  '2454.TW': '44081',  // MediaTek
  '2308.TW': '44070',  // Delta Electronics
  '2412.TW': '44071',  // Chunghwa Telecom
  '2881.TW': '44076',  // Fubon Financial
  '2882.TW': '44077',  // Cathay Financial
  '2886.TW': '44078',  // Mega Financial
};

export default function InvestingWidget({ symbol }: InvestingWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || scriptLoadedRef.current) return;

    const investingId = INVESTING_SYMBOL_MAP[symbol];
    
    if (!investingId) {
      console.warn(`No Investing.com mapping for symbol: ${symbol}`);
      return;
    }

    // Clear previous content
    containerRef.current.innerHTML = '';

    // Create widget container
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'investing-widget-container';
    widgetDiv.innerHTML = `
      <div class="tradingview-widget-container">
        <div id="investing-chart-${investingId}"></div>
      </div>
    `;
    containerRef.current.appendChild(widgetDiv);

    // Load Investing.com script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://www.investing.com/common/modules/js_instrument_chart/api/charts.min.js';
    script.async = true;
    
    script.onload = () => {
      try {
        // @ts-ignore - Investing.com API
        if (window.Investingcharts) {
          // @ts-ignore
          new window.Investingcharts({
            pair_ID: investingId,
            container: `investing-chart-${investingId}`,
            type: 'advanced',
            width: '100%',
            height: '500',
            interval: 'D',
            lang: 'en'
          });
        }
      } catch (error) {
        console.error('Failed to initialize Investing.com chart:', error);
      }
    };

    document.body.appendChild(script);
    scriptLoadedRef.current = true;

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      scriptLoadedRef.current = false;
    };
  }, [symbol]);

  const investingId = INVESTING_SYMBOL_MAP[symbol];

  if (!investingId) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-muted rounded-lg">
        <div className="text-center p-6">
          <p className="text-muted-foreground mb-4">
            Chart not available for {symbol}
          </p>
          <a 
            href={`https://www.investing.com/search/?q=${symbol.replace('.TW', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            View on Investing.com →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full h-[500px]" />
      <div className="text-xs text-muted-foreground mt-2 text-center">
        Powered by{' '}
        <a 
          href="https://www.investing.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Investing.com
        </a>
      </div>
    </div>
  );
}
