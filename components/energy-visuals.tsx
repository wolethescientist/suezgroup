import { GroupMark } from "./logo";

type CompanyVisualKind = "gas" | "power" | "trading";

export function EnergyField({ className = "" }: { className?: string }) {
  return (
    <div className={`energy-field ${className}`}>
      <div className="energy-field-grid" aria-hidden="true" />
      <div className="energy-field-topline">
        <span>Network pulse</span>
        <span>Abuja / 14.2°N</span>
      </div>
      <svg className="energy-field-lines" viewBox="0 0 620 430" aria-hidden="true">
        <path d="M310 214C250 150 160 120 76 78" />
        <path d="M310 214C405 178 494 124 562 74" />
        <path d="M310 214C245 276 180 320 82 354" />
        <path d="M310 214C386 270 460 316 548 352" />
        <circle cx="76" cy="78" r="5" />
        <circle cx="562" cy="74" r="5" />
        <circle cx="82" cy="354" r="5" />
        <circle cx="548" cy="352" r="5" />
      </svg>
      <div className="energy-field-core">
        <span className="energy-field-core-ring" aria-hidden="true" />
        <GroupMark className="h-14 w-auto text-ember" />
        <span className="energy-field-core-name">Suez Group</span>
        <span className="energy-field-core-meta">one route / three operators</span>
      </div>
      <div className="energy-field-readout energy-field-readout-gas">
        <span className="energy-field-readout-index">01 / LPG</span>
        <strong>3–50 kg</strong>
        <span>weighed at the door</span>
      </div>
      <div className="energy-field-readout energy-field-readout-power">
        <span className="energy-field-readout-index">02 / POWER</span>
        <strong>prepaid</strong>
        <span>web · mobile · kiosks</span>
      </div>
      <div className="energy-field-readout energy-field-readout-trading">
        <span className="energy-field-readout-index">03 / UPSTREAM</span>
        <strong>road tanker</strong>
        <span>contracted volume</span>
      </div>
      <div className="energy-field-footline">
        <span>Since 2012</span>
        <span className="energy-field-pulse"><i /> Operating network</span>
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
