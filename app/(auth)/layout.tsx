import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HindsightLogo from "@/components/HindsightLogo";
import { AuthPreview } from "./auth-preview";

const Layout = async ({ children }: { children : React.ReactNode }) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) redirect('/')

    return (
        <main className="flex min-h-screen bg-background">
            <section className="flex flex-col flex-1 max-w-md mx-auto px-8 py-12 overflow-y-auto">
                <Link href="/" className="mb-10 flex items-center gap-2.5">
                    <HindsightLogo className="size-6 text-brand" />
                    <span className="text-xl font-bold text-foreground tracking-tight">Hindsight</span>
                </Link>

                <div className="flex-1">{children}</div>
            </section>

            <section className="hidden lg:flex flex-col flex-1 border-l border-border overflow-hidden relative">
                <AuthPreview />
            </section>
        </main>
    )
}
export default Layout
