"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, MapPin } from "lucide-react";

export interface OrderConfirmProps {
  data?: {
    /** Name of the product being ordered. */
    productName?: string;
    /** Product variant such as color or size. */
    productVariant?: string;
    /** URL to the product image. */
    productImage?: string;
    /** Quantity of items being ordered. @default 1 */
    quantity?: number;
    /** Total price for the order. */
    price?: number;
    /** Expected delivery date string (e.g., "Tue. Dec 10"). */
    deliveryDate?: string;
    /** Delivery address for the order. */
    deliveryAddress?: string;
    /** Whether shipping is free for this order. @default true */
    freeShipping?: boolean;
  };
  actions?: {
    /** Called when the user confirms the order. */
    onConfirm?: () => void;
  };
  appearance?: {
    /** Currency code for formatting the price. @default "USD" */
    currency?: string;
  };
  control?: {
    /** Shows loading state on the confirm button. @default false */
    isLoading?: boolean;
  };
}

/**
 * Order confirmation component with product image, delivery info, and confirm action.
 */
export function OrderConfirm({
  data,
  actions,
  appearance,
  control,
}: OrderConfirmProps) {
  const productName = data?.productName;
  const productVariant = data?.productVariant;
  const productImage = data?.productImage;
  const quantity = data?.quantity ?? 1;
  const price = data?.price;
  const deliveryDate = data?.deliveryDate;
  const deliveryAddress = data?.deliveryAddress;
  const freeShipping = data?.freeShipping ?? true;
  const { onConfirm } = actions ?? {};
  const { currency = "USD" } = appearance ?? {};
  const { isLoading = false } = control ?? {};

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  };

  return (
    <div className="w-full rounded-md bg-card sm:rounded-lg">
      {/* Product info */}
      <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-2">
        {productImage && (
          <img
            src={productImage}
            alt={productName ?? "Product image"}
            className="h-12 w-12 rounded-sm bg-muted/30 object-contain sm:h-16 sm:w-16 sm:rounded-md"
          />
        )}
        <div className="min-w-0 flex-1">
          {productName && (
            <h3 className="truncate text-sm font-medium sm:text-base">
              {productName}
            </h3>
          )}
          {(productVariant || quantity) && (
            <p className="text-xs text-muted-foreground sm:text-sm">
              {productVariant}
              {productVariant && quantity ? " · " : ""}Qty: {quantity}
            </p>
          )}
          {/* Mobile: price below product info */}
          <div className="mt-1 sm:hidden">
            {price !== undefined && (
              <p className="text-sm font-semibold">{formatCurrency(price)}</p>
            )}
            {freeShipping && (
              <p className="text-xs text-green-600">Free shipping</p>
            )}
          </div>
        </div>
        {/* Desktop: price on the right */}
        <div className="hidden text-right sm:block">
          {price !== undefined && (
            <p className="font-semibold">{formatCurrency(price)}</p>
          )}
          {freeShipping && (
            <p className="text-sm text-green-600">Free shipping</p>
          )}
        </div>
      </div>

      <div className="border-t" />

      {/* Delivery info & button */}
      <div className="space-y-3 p-3 sm:flex sm:items-center sm:justify-between sm:space-y-0 sm:py-2 sm:pr-2 sm:pl-4">
        <div className="space-y-1.5 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:space-y-0 sm:text-sm">
          {deliveryDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 flex-shrink-0 sm:h-3.5 sm:w-3.5" />
              <span>{deliveryDate}</span>
            </div>
          )}
          {deliveryDate && deliveryAddress && (
            <span className="hidden sm:inline">&bull;</span>
          )}
          {deliveryAddress && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 flex-shrink-0 sm:h-3.5 sm:w-3.5" />
              <span className="truncate">{deliveryAddress}</span>
            </div>
          )}
        </div>

        <Button
          size="sm"
          className="w-full sm:w-auto"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? "Confirming..." : "Confirm order"}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>
    </div>
  );
}
