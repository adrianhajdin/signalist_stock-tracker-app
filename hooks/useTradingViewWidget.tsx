'use client';
import { useEffect, useRef } from "react";

const useTradingViewWidget = (
    scriptUrl: string, 
    config: Record<string, unknown>, 
    height = 600
) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // ✅ 清空容器並重新載入（移除 dataset.loaded 檢查）
        const container = containerRef.current;
        container.innerHTML = '';

        // 建立 widget 容器
        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'tradingview-widget-container__widget';
        widgetContainer.style.width = '100%';
        widgetContainer.style.height = `${height}px`;
        container.appendChild(widgetContainer);

        // 建立並插入 script
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.type = "text/javascript";
        script.innerHTML = JSON.stringify(config);

        container.appendChild(script);

        // ✅ Cleanup：當 config/symbol 改變時清除舊 widget
        return () => {
            if (container) {
                container.innerHTML = '';
            }
        };
    }, [scriptUrl, config, height]); // ✅ config 改變時會觸發重新載入

    return containerRef;
};

export default useTradingViewWidget;
