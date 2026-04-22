import { Card, CardContent } from "@/components/ui/card";
import { PriceGauge } from "@/components/ui/gauge";

// ── Showcase page for reusable UI primitives ──────────────────────────────
//
// Lives at /components. Add a <Section> for every primitive worth showing
// off — currently just <PriceGauge /> but the page is structured so any
// future primitive can drop in alongside.

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  );
}

function Demo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-32">
      <CardContent className="h-full flex flex-col justify-between p-4">
        <div className="flex-1 flex items-center">{children}</div>
        <p className="text-xs text-muted-foreground pt-3">{label}</p>
      </CardContent>
    </Card>
  );
}

export default function ComponentsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Components</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visual reference for reusable primitives.
        </p>
      </div>

      <Section title="Gauge">
        <Demo label="Static — entry, target, stop">
          <div className="w-full">
            <PriceGauge entry={221.53} target={245} stop={207} />
          </div>
        </Demo>

        <Demo label="Active — trailing up (LONG +5.4%)">
          <div className="w-full">
            <PriceGauge
              entry={221.53}
              target={245}
              stop={207}
              current={233.5}
              direction="LONG"
            />
          </div>
        </Demo>

        <Demo label="Active — trailing down (LONG −3.1%)">
          <div className="w-full">
            <PriceGauge
              entry={221.53}
              target={245}
              stop={207}
              current={214.7}
              direction="LONG"
            />
          </div>
        </Demo>

        <Demo label="Wide range — entry far from stop">
          <div className="w-full">
            <PriceGauge entry={150} target={200} stop={140} />
          </div>
        </Demo>

        <Demo label="SHORT — trailing in profit">
          <div className="w-full">
            <PriceGauge
              entry={50}
              target={42}
              stop={54}
              current={45}
              direction="SHORT"
            />
          </div>
        </Demo>

        <Demo label="Only entry (no levels)">
          <div className="w-full">
            <PriceGauge entry={100} />
          </div>
        </Demo>
      </Section>
    </div>
  );
}
