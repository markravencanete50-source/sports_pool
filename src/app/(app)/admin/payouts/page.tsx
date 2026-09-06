import { redirect } from "next/navigation";

/** The payouts screen moved into Finance → Withdrawals. */
export default function AdminPayoutsRedirect() {
  redirect("/admin/finance/withdrawals");
}
