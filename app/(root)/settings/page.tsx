import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { getApiKeyStatus } from "@/lib/actions/api-keys.actions";
import { AlpacaKeyForm } from "@/components/settings/AlpacaKeyForm";
import { ModelPreferenceForm } from "@/components/settings/ModelPreferenceForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const alpacaStatus = await getApiKeyStatus("ALPACA");
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? "—";

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Account and preferences
        </p>
      </div>
      <Separator />

      {/* Account */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </p>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm">{displayName}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm">{user?.email ?? "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Agent
        </p>
        <ModelPreferenceForm />
      </div>

      {/* API Keys */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          API Keys
        </p>
        <AlpacaKeyForm initial={alpacaStatus} />
      </div>
    </div>
  );
}
