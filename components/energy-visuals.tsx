import { GroupMark } from "./logo";

type CompanyVisualKind = "gas" | "power" | "trading";

export function EnergyField({ className = "" }: { className?: string }) {
  return (
    <div className={`energy-constellation ${className}`}>
      <div className="energy-constellation-kicker">Abuja / route 01</div>
      <svg className="energy-constellation-lines" viewBox="0 0 620 430" aria-hidden="true">
        <path d="M310 214C250 150 160 120 76 78" />
        <path d="M310 214C405 178 494 124 562 74" />
        <path d="M310 214C245 276 180 320 82 354" />
        <path d="M310 214C386 270 460 316 548 352" />
        <circle cx="76" cy="78" r="5" />
        <circle cx="562" cy="74" r="5" />
        <circle cx="82" cy="354" r="5" />
        <circle cx="548" cy="352" r="5" />
      </svg>
      <div className="energy-constellation-core">
        <span className="energy-constellation-core-glow" aria-hidden="true" />
        <span className="energy-constellation-core-ring" aria-hidden="true" />
        <GroupMark className="h-20 w-auto text-slate" />
        <span className="energy-constellation-core-name">Suez Group</span>
      </div>
      <div className="energy-constellation-label energy-constellation-label-gas">
        <span>01 / gas</span>
        <strong>Cooking gas</strong>
        <em>cylinder / home / route</em>
      </div>
      <div className="energy-constellation-label energy-constellation-label-power">
        <span>02 / power</span>
        <strong>Prepaid electricity</strong>
        <em>token / wallet / kiosk</em>
      </div>
      <div className="energy-constellation-label energy-constellation-label-trading">
        <span>03 / upstream</span>
        <strong>Bulk haulage</strong>
        <em>import / tanker / volume</em>
      </div>
      <div className="energy-constellation-caption">
        <span>one route / three operators</span>
        <span>since 2012</span>
      </div>
    </div>
  );
}

export function CompanyVisual({ kind }: { kind: CompanyVisualKind }) {
  const copy = {
    gas: { index: "01", label: "LPG / LAST MILE", caption: "Cylinder, scale, doorstep" },
    power: { index: "02", label: "POWER / DIGITAL", caption: "Token, wallet, agent" },
    trading: { index: "03", label: "UPSTREAM / ROAD", caption: "Import, tanker, volume" },
  }[kind];

  return (
    <div className={`company-visual company-visual-${kind}`}>
      <div className="company-visual-header">
        <span>{copy.index}</span>
        <span>{copy.label}</span>
      </div>
      <div className="company-visual-body">
        {kind === "gas" && (
          <div className="gas-cylinder" aria-hidden="true">
            <div className="gas-cylinder-cap" />
            <div className="gas-cylinder-shell"><span /></div>
            <div className="gas-cylinder-base" />
          </div>
        )}
        {kind === "power" && (
          <div className="power-token" aria-hidden="true">
            <span className="power-token-mark">₦</span>
            <strong>12,450</strong>
            <span>units delivered</span>
            <i />
          </div>
        )}
        {kind === "trading" && (
          <svg className="tanker-route" viewBox="0 0 260 150" aria-hidden="true">
            <path d="M18 116C62 82 74 105 111 74S177 50 242 20" />
            <circle cx="18" cy="116" r="5" />
            <circle cx="242" cy="20" r="5" />
            <path className="tanker" d="M92 73h58a8 8 0 0 1 8 8v19H92zM158 86h14l10 14h-24zM86 100h96" />
            <circle cx="109" cy="104" r="7" />
            <circle cx="163" cy="104" r="7" />
          </svg>
        )}
      </div>
      <div className="company-visual-footer">
        <span>{copy.caption}</span>
        <span className="company-visual-arrow">↗</span>
      </div>
    </div>
  );
}

export function RouteSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="route-signal">
      <div className="route-signal-map" aria-hidden="true">
        <span className="route-signal-node route-signal-node-a" />
        <span className="route-signal-node route-signal-node-b" />
        <span className="route-signal-node route-signal-node-c" />
        <span className="route-signal-line route-signal-line-a" />
        <span className="route-signal-line route-signal-line-b" />
      </div>
      <div className="route-signal-copy">
        <span className="eyebrow">{label}</span>
        <strong>{value}</strong>
        <span>physical route / digital reach</span>
      </div>
    </div>
  );
}
