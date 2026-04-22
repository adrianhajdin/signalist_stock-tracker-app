"use client";

import { Button } from "@/components/ui/button";

/**
 * Represents a quick reply option.
 */
export interface QuickReply {
  label?: string;
  icon?: React.ReactNode;
}

export interface QuickReplyProps {
  data?: {
    /** Array of quick reply options to display as buttons. */
    replies?: QuickReply[];
  };
  actions?: {
    /** Called when a user selects a quick reply option. */
    onSelectReply?: (reply: QuickReply) => void;
  };
}

/**
 * Quick reply button set for chat interfaces.
 * Displays predefined response options as pill-shaped buttons.
 */
export function QuickReply({ data, actions }: QuickReplyProps) {
  const replies = data?.replies ?? [];
  const onSelectReply = actions?.onSelectReply;

  return (
    <div className="w-full rounded-lg bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {replies.map((reply, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="rounded-full text-xs sm:text-sm"
            onClick={() => onSelectReply?.(reply)}
          >
            {reply.icon}
            {reply.label && <span>{reply.label}</span>}
          </Button>
        ))}
      </div>
    </div>
  );
}
