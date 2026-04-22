import { redirect } from 'next/navigation';

/**
 * /trades/[id]/thesis — redirect to the trade detail page.
 * Full thesis is now displayed inline on the trade detail page.
 */
export default async function TradeThesisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/trades/${id}`);
}
