'use client';

import React, { useEffect, useRef } from 'react';

interface YahooFinanceChartProps {
  symbol: string;
  height?: number;
}

const YahooFinanceChart = ({ symbol, height = 600 }: YahooFinanceChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    // 建立 iframe
    const iframe = document.createElement('iframe');
    iframe.src = `https://finance.yahoo.com/chart/${symbol}`;
    iframe.style.width = '100%';
    iframe.style.height = `${height}px`;
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    iframe.allow = 'fullscreen';

    container.appendChild(iframe);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, height]);

  return (
    <div 
      ref={containerRef} 
      className="w-full rounded-lg overflow-hidden bg-gray-900"
    />
  );
};

export default YahooFinanceChart;
