import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getOrg } from "@/lib/settings";
import { login } from "@/lib/actions/auth";
import { ActionForm, SubmitBtn } from "@/components/form";
import { Field } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  const org = await getOrg().catch(() => null);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* brand panel */}
      {/*
        ponytail: this was brand-800 — a muddy brown — with two big blurred
        orange circles bleeding across it. Brown under orange blur is mud, and
        it was the first thing anyone saw of the product.
        Deep ink with a single warm glow low on the panel is the same brand,
        read as intent rather than as a smudge, and the dot grid gives the
        surface something to be instead of flat colour.
      */}
      <section className="relative hidden overflow-hidden bg-panel p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at center, #fff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-32 h-[34rem] w-[34rem] rounded-full bg-brand-500/25 blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-brand-700/25 blur-[110px]"
          aria-hidden
        />
        {/* A hairline of brand down the seam, so the panel ends deliberately. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-brand-500/40 to-transparent" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-on-brand shadow-lg shadow-brand-900/40">
              S
            </span>
            <div>
              <p className="text-lg leading-tight font-bold">{org?.name ?? "Suez Group"}</p>
              <p className="text-xs font-semibold tracking-wide text-brand-300">Staff portal</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[2.75rem] leading-[1.1] font-bold tracking-[-0.03em]">One portal for the whole company.</h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">
            People, finance, operations and internal work — in one place, with an audit trail behind every action.
          </p>
          <ul className="mt-8 space-y-3 text-sm font-semibold">
            {[
              "Memos & circulars with read and acknowledgement tracking",
              "Leave requests routed to the right approver automatically",
              "Workflow requests to pull documents from colleagues",
              "Projects, finance, procurement, inventory and assets",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-white/85">
                {/* A drawn check, at the same stroke weight as every other icon
                    in the product — the "✓" glyph rendered at whatever weight
                    the font felt like and never matched. */}
                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30 ring-inset">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}
                       strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                    <path d="M4 12.5 9 17.5 20 6.5" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs font-medium text-white/45">
          © {new Date().getFullYear()} {org?.name ?? "Suez Group"}. Internal use only.
        </p>
      </section>

      {/* form panel */}
      <section className="flex items-center justify-center bg-canvas p-6 sm:p-12">
        <div className="w-full max-w-sm rise">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500 text-lg font-bold text-ink">
              S
            </span>
          </div>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm font-medium text-ink-soft">Sign in with your work email to continue.</p>

          <ActionForm action={login} className="mt-7 space-y-4">
            <Field label="Work email">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@suez.local"
                className="field"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="field"
              />
            </Field>
            <SubmitBtn className="w-full">Sign in</SubmitBtn>
          </ActionForm>

          <div className="mt-8 rounded-2xl bg-brand-50/70 p-4 text-xs font-semibold text-brand-800 ring-1 ring-brand-100 ring-inset">
            <p className="mb-1.5 font-bold">Demo accounts · password123</p>
            <p>admin@suez.local — Managing Director</p>
            <p>hr@suez.local — Head of HR</p>
            <p>manager@suez.local — Sales lead</p>
            <p>staff@suez.local — Account executive</p>
          </div>

          <p className="mt-6 text-xs font-medium text-ink-soft">
            Trouble signing in? Contact IT &amp; Digital on extension 204.
          </p>
        </div>
      </section>
    </main>
  );
}
