'use client';

import React from 'react';
import useTradingViewWidget from "@/hooks/useTradingViewWidget";
import { cn } from "@/lib/utils";

interface TradingViewWidgetProps {
    title?: string;
    scriptUrl: string;
    config: Record<string, unknown>;
    height?: number;
    className?: string;
}

const TradingViewWidget = ({ 
    title, 
    scriptUrl, 
    config, 
    height = 600, 
    className 
}: TradingViewWidgetProps) => {
    const containerRef = useTradingViewWidget(scriptUrl, config, height);

    return (
        <div className="w-full">
            {title && (
                <h3 className="font-semibold text-2xl text-gray-100 mb-5">
                    {title}
                </h3>
            )}
            <div 
                className={cn('tradingview-widget-container', className)} 
                ref={containerRef}
            />
        </div>
    );
};

// ✅ 移除 memo，讓元件在 symbol 改變時正常重新渲染
export default TradingViewWidget;
