import { redirect } from "next/navigation";
import { BillingAccountClient } from "@/components/billing/BillingAccountClient";
import { getBillingAccount, getCreditBalance } from "@/lib/billing/account";
import { getBillingFlags } from "@/lib/billing/flags";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function BillingAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/billing");
  if (!getBillingFlags().creditBillingEnabled) redirect("/pricing");
  const [account, balance] = await Promise.all([
    getBillingAccount(user.id), getCreditBalance(user.id),
  ]);
  return <BillingAccountClient account={account} balance={balance} />;
}
