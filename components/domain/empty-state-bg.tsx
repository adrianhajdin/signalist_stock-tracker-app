"use client";

import { useEffect, useState } from "react";
import DotGrid from "@/components/DotGrid";

/** DotGrid wrapper that adjusts colors for light/dark mode */
export function EmptyStateBg() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <DotGrid
      dotSize={3}
      gap={10}
      baseColor={isDark ? "#3a3a3a" : "#d4d4d4"}
      activeColor={isDark ? "#8a8a6a" : "#6b7b5b"}
      proximity={90}
      shockRadius={120}
    />
  );
}
