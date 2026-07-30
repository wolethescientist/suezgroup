import Link from "next/link";
import { Web } from "@/components/texture";
import { Reveal, WipeLines } from "@/components/reveal";

export default function NotFound() {
  return (
    <section className="relative flex min-h-[85vh] items-center overflow-hidden pt-28">
      <Web origin={{ x: 70, y: 46 }} nodes={200} />

      <div className="measure relative">
        <Reveal className="reveal" immediate>
          <div className="eyebrow" style={{ "--i": 0 } as React.CSSProperties}>
            Error 404
          </div>
          <h1 className="mt-8 text-display-l" style={{ "--i": 1 } as React.CSSProperties}>
            <WipeLines lines={["Off the network."]} />
          </h1>
          <p
            className="mt-9 max-w-lg text-body-l text-fg-slate-muted"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            This page does not exist. If a link on this site sent you here, tell us
            and we will fix it.
          </p>
          <div
            className="mt-10 flex flex-wrap gap-3"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <Link href="/" className="btn btn-ember">
              Back to home
            </Link>
            <Link href="/companies" className="btn btn-ghost">
              Our companies
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
