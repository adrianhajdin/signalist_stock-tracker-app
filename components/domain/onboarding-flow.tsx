"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, ArrowLeft, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { saveApiKey } from "@/lib/actions/api-keys.actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import HindsightLogo from "@/components/HindsightLogo";
import { BuilderPreview } from "@/components/domain/builder-preview";
import { RunPreview } from "@/components/domain/run-preview";
import { BriefPreview } from "@/components/domain/brief-preview";

// ── Constants ─────────────────────────────────────────────────────────────────

const ONBOARDING_KEY = "hindsight-onboarding-complete";

function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

function markOnboardingComplete() {
  if (typeof window !== "undefined") {
    localStorage.setItem(ONBOARDING_KEY, "true");
  }
}

// ── Tour slide data ───────────────────────────────────────────────────────────

const TOUR_SLIDES = [
  {
    preview: <BuilderPreview className="h-[340px] rounded-none" />,
    title: "Build analysts in conversation",
    subtitle:
      "Describe your trading style, preferred sources, and watchlist. The AI builder researches your tickers, configures domain monitors, and creates a complete autonomous analyst.",
  },
  {
    preview: <RunPreview className="h-[340px] rounded-none" />,
    title: "Analysts research on their own",
    subtitle:
      "Each session reads your morning intelligence, validates opportunities with live market data, writes conviction theses, and places paper trades — all autonomously.",
  },
  {
    preview: <BriefPreview className="h-[340px] rounded-none" />,
    title: "A full team to manage your portfolio",
    subtitle:
      "Your analysts summarize performance, update watchlist priorities, write tomorrow's intelligence brief, and adjust search monitors — building a feedback loop that improves over time.",
  },
] as const;

// ── Step 1: Name Collection ──────────────────────────────────────────────────

function NameStep({
  initialName,
  onComplete,
}: {
  initialName: string;
  onComplete: () => void;
}) {
  const parts = initialName.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(parts[0] || "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" ") || "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      toast.error("Please enter your first and last name");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { full_name: `${first} ${last}` },
      });
      if (error) {
        toast.error("Failed to save your name");
        return;
      }
      router.refresh();
      onComplete();
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col items-center text-center space-y-3">
        <HindsightLogo className="size-10 text-brand" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">What&apos;s your name?</h2>
          <p className="text-sm text-muted-foreground">
            We&apos;ll use this to personalize your experience.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="onboard-first" className="text-xs">
            First name
          </Label>
          <Input
            id="onboard-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First"
            autoFocus
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="onboard-last" className="text-xs">
            Last name
          </Label>
          <Input
            id="onboard-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last"
            autoComplete="family-name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        </div>
      </div>

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}

// ── Step 2: Alpaca Connection ────────────────────────────────────────────────

function AlpacaStep({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
        toast.success("Alpaca connected");
        router.refresh();
        onComplete();
      } else if (result.success) {
        toast.error(
          "Keys saved but Alpaca rejected them. Double-check and try again."
        );
      } else {
        toast.error(result.error || "Failed to save");
      }
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col items-center text-center space-y-2">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/icons/alpaca.svg"
            alt="Alpaca"
            className="h-8 w-8 rounded"
          />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Connect Alpaca Paper Trading</h2>
          <p className="text-sm text-muted-foreground">
            Hindsight uses Alpaca for paper trading — simulated trades with real
            market prices.
          </p>
        </div>
      </div>

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
          <li>
            Click &quot;Regenerate&quot; under API Keys and copy both the Key and
            Secret
          </li>
        </ol>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="onboard-alpaca-key" className="text-xs">
            API Key
          </Label>
          <Input
            id="onboard-alpaca-key"
            type="text"
            placeholder="PK..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="onboard-alpaca-secret" className="text-xs">
            API Secret
          </Label>
          <div className="relative">
            <Input
              id="onboard-alpaca-secret"
              type={showSecret ? "text" : "password"}
              placeholder="Secret key"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isPending} className="w-full">
        {isPending ? "Connecting..." : "Connect & Verify"}
      </Button>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        Skip for now
      </button>
    </div>
  );
}

// ── Step 3: Tour Slides ──────────────────────────────────────────────────────

function TourStep({
  slideIndex,
  onNext,
  onPrev,
  onFinish,
  isFirst,
  isLast,
}: {
  slideIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onFinish: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const slide = TOUR_SLIDES[slideIndex];

  return (
    <>
      <div className="overflow-hidden w-full">{slide.preview}</div>

      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {slide.subtitle}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5">
          {TOUR_SLIDES.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === slideIndex
                  ? "w-6 bg-foreground"
                  : "w-1.5 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {isFirst ? (
            <div />
          ) : (
            <Button variant="ghost" size="sm" onClick={onPrev}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button size="sm" onClick={isLast ? onFinish : onNext}>
            {isLast ? (
              <>
                Get Started
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Onboarding Flow (orchestrator) ───────────────────────────────────────────

type OnboardingStep = "name" | "alpaca";

export function OnboardingFlow({
  needsName,
  hasAlpacaKey,
  initialFullName,
}: {
  needsName: boolean;
  hasAlpacaKey: boolean;
  initialFullName: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("name");

  // Determine initial step on mount
  useEffect(() => {
    if (hasCompletedOnboarding()) return;

    if (needsName) {
      setStep("name");
    } else if (!hasAlpacaKey) {
      setStep("alpaca");
    } else {
      // Nothing left — mark done
      markOnboardingComplete();
      return;
    }
    setOpen(true);
  }, [needsName, hasAlpacaKey]);

  const finish = useCallback(() => {
    markOnboardingComplete();
    setOpen(false);
  }, []);

  const advanceFromName = useCallback(() => {
    if (!hasAlpacaKey) {
      setStep("alpaca");
    } else {
      finish();
    }
  }, [hasAlpacaKey, finish]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-2xl p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {step === "name" && "Welcome to Hindsight"}
          {step === "alpaca" && "Connect Alpaca"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Onboarding flow
        </DialogDescription>

        {step === "name" && (
          <NameStep
            initialName={initialFullName}
            onComplete={advanceFromName}
          />
        )}

        {step === "alpaca" && (
          <AlpacaStep
            onComplete={finish}
            onSkip={finish}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Product Tour Only (for re-trigger from sidebar) ──────────────────────────

export function ProductTourDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [slideIndex, setSlideIndex] = useState(0);

  // Reset slide when opened
  useEffect(() => {
    if (open) setSlideIndex(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">
          {TOUR_SLIDES[slideIndex]?.title ?? "Product Tour"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Product tour
        </DialogDescription>

        {/* White close button — always visible over dark Silk backgrounds */}
        <DialogClose className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <TourStep
          slideIndex={slideIndex}
          onNext={() => setSlideIndex((s) => s + 1)}
          onPrev={() => setSlideIndex((s) => s - 1)}
          onFinish={() => onOpenChange(false)}
          isFirst={slideIndex === 0}
          isLast={slideIndex === TOUR_SLIDES.length - 1}
        />
      </DialogContent>
    </Dialog>
  );
}
