import { redirect } from "next/navigation";

/** Finance is now a CRM module; ERP finance routes are intentionally closed. */
export default function FinanceRemoved({ children: _children }: { children: React.ReactNode }) {
  redirect("/");
}
