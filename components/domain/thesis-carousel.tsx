"use client";

/**
 * ThesisCarousel — horizontally scrollable carousel of ThesisMiniCards.
 *
 * Used in the agent run thread to group every record_thesis call from a
 * single agent turn into one widget instead of N stacked full ThesisCards.
 * Wraps the ShadCN/embla Carousel primitive — drag to scroll, prev/next
 * buttons, and slides snap to start.
 */

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { ThesisMiniCard } from "@/components/domain/thesis-mini-card";
import type { ThesisCardData } from "@/components/domain";

export function ThesisCarousel({ theses }: { theses: ThesisCardData[] }) {
  if (theses.length === 0) return null;

  return (
    // Full chat width. Tighter gutter (-ml-2 / pl-2 instead of the default
    // -ml-4 / pl-4). Arrows pulled in to -left-3 / -right-3 so they sit
    // just outside the card edges instead of needing a 48px parent gutter.
    <Carousel opts={{ align: "start" }} className="py-1">
      <CarouselContent className="-ml-2">
        {theses.map((thesis, i) => (
          <CarouselItem
            key={`${thesis.ticker}-${i}`}
            className="basis-full sm:basis-1/2 md:basis-1/3 pl-2"
          >
            <div className="p-1">
              <ThesisMiniCard thesis={thesis} />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
