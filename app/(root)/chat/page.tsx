"use client";

import { ChatEntryComposer } from "@/components/assistant-ui/chat-entry-composer";

export default function ChatPage() {
  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col items-center justify-center px-4">
      <div className="w-full max-w-[48rem] space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Hindsight</h1>
          <p className="text-sm text-muted-foreground">
            Ask anything. Research stocks, analyze trades, or update your strategy.
          </p>
        </div>

        <ChatEntryComposer
          targetUrl="/analysts/new"
          tooltip={{
            title: "Start here",
            description: "Type a ticker, question, or / for commands to get started.",
            storageKey: "chat-entry",
          }}
          features={{
            tickerSearch: true,
            slashCommands: true,
            plusMenu: true,
            placeholder: "Ask anything or type / for commands…",
          }}
        />
      </div>
    </div>
  );
}
