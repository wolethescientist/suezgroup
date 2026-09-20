import { canAny, requireUser } from "@/lib/auth";
import { NavTabs } from "@/components/nav-tabs";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const admin = canAny(me, "settings.organisation", "settings.email");

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, your signature, and — for administrators — the whole workspace." />
      <NavTabs
        items={[
          { href: "/settings", label: "Profile" },
          { href: "/settings/signature", label: "Signature" },
          { href: "/settings/security", label: "Security" },
          ...(admin
            ? [
                { href: "/settings/organisation", label: "Organisation" },
                { href: "/settings/email", label: "Email" },
              ]
            : []),
        ]}
      />
      {children}
    </>
  );
}
