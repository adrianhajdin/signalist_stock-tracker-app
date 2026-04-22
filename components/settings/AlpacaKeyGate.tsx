"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { saveApiKey } from "@/lib/actions/api-keys.actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

/**
 * Modal that prompts users to enter their Alpaca API keys.
 * - allowSkip=true: user can dismiss and explore the app first.
 * - allowSkip=false (default): user must connect before proceeding.
 */
export function AlpacaKeyGate({
  hasKey,
  allowSkip = false,
}: {
  hasKey: boolean;
  allowSkip?: boolean;
}) {
  const [open, setOpen] = useState(!hasKey);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (hasKey) return null;

  function handleSave() {
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast.error("Both API Key and Secret are required");
      return;
    }
    startTransition(async () => {
      const result = await saveApiKey({
        provider: "ALPACA",
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
      });
      if (result.success && result.verified) {
        toast.success("Alpaca connected — you're all set");
        setOpen(false);
        router.refresh();
      } else if (result.success) {
        toast.error("Keys saved but Alpaca rejected them. Double-check and try again.");
      } else {
        toast.error(result.error || "Failed to save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={allowSkip ? setOpen : undefined}>
      <DialogContent showCloseButton={allowSkip}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <img src="/assets/icons/alpaca.svg" alt="Alpaca" className="h-6 w-6 rounded" />
              Connect Alpaca Paper Trading
            </span>
          </DialogTitle>
          <DialogDescription>
            Hindsight uses Alpaca for paper trading — simulated trades with real market prices.
            You need a free Alpaca account to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-md bg-muted p-3 text-sm space-y-2">
            <p className="font-medium">How to get your API keys:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
              <li>
                Go to{" "}
                <a
                  href="https://app.alpaca.markets/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-foreground"
                >
                  alpaca.markets/signup
                </a>{" "}
                and create a free account
              </li>
              <li>Once logged in, switch to your Paper Account</li>
              <li>
                Click{" "}
                <a
                  href="https://app.alpaca.markets/paper/account/management"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-foreground"
                >
                  Account Management
                </a>{" "}
                under your Paper Account
              </li>
              <li>Click &quot;Regenerate&quot; under API Keys and copy both the Key and Secret</li>
            </ol>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gate-key" className="text-xs">API Key</Label>
              <Input
                id="gate-key"
                type="text"
                placeholder="PK..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gate-secret" className="text-xs">API Secret</Label>
              <div className="relative">
                <Input
                  id="gate-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder="Secret key"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isPending} className="w-full">
            {isPending ? "Connecting..." : "Connect & Verify"}
          </Button>

          {allowSkip && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Skip for now
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
