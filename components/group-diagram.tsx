/**
 * The group's focal object — the thing the site is actually about, drawn rather
 * than described. SuezElectric has a token readout, Suez Gas has a cylinder gauge;
 * the parent gets its structure: one holding node feeding three operating companies,
 * each carrying its own real brand colour.
 *
 * Pure SVG + CSS. The connectors draw themselves in, the nodes settle after them.
 */

const NODES = [
  {
    x: 96,
    label: "Suez Gas",
    sector: "LPG",
    meta: "Since 2012",
    color: "#f58220",
    delay: 0,
  },
  {
    x: 300,
    label: "SuezElectric",
    sector: "Power",
    meta: "Since 2020",
    color: "#f18835",
    delay: 140,
  },
  {
    x: 504,
    label: "Suez Trading",
    sector: "Upstream",
    meta: "Import & haulage",
    color: "#8d94a0",
    delay: 280,
  },
];

const PARENT = { x: 300, y: 78 };
const CHILD_Y = 268;

export function GroupDiagram({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 600 400"
        className="h-auto w-full"
        role="img"
        aria-label="Suez Group structure: a holding group over Suez Gas, SuezElectric and Suez Trading International"
      >
        {/* Connectors — cubic curves so the structure reads as organic, not an org chart */}
        <g fill="none" strokeLinecap="round">
          {NODES.map((n) => {
            const d = `M${PARENT.x} ${PARENT.y + 34}C${PARENT.x} ${PARENT.y + 130} ${n.x} ${CHILD_Y - 130} ${n.x} ${CHILD_Y - 30}`;
            return (
              <path
                key={n.label}
                d={d}
                stroke={n.color}
                strokeOpacity={0.5}
                strokeWidth={1.4}
                className="dg-link"
                style={{ animationDelay: `${n.delay}ms` }}
                pathLength={1}
              />
            );
          })}
        </g>

        {/* Parent node */}
        <g className="dg-node" style={{ animationDelay: "0ms" }}>
          <circle
            cx={PARENT.x}
            cy={PARENT.y}
            r={33}
            fill="#121922"
            stroke="#f3852a"
            strokeOpacity={0.55}
          />
          <circle cx={PARENT.x} cy={PARENT.y} r={44} stroke="#f3852a" strokeOpacity={0.16} fill="none" />
          {/* The group mark, scaled into the node */}
          <g transform={`translate(${PARENT.x - 12} ${PARENT.y - 16}) scale(0.335)`} fill="#f3852a">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M36 3C48 24 64 36 64 50A28 28 0 0 1 8 50C8 36 24 24 36 3ZM39.5 19C34.5 31 28.5 42.5 23 51H34C32 57.5 30 63 28.5 69C35.5 60.5 43.5 50 49.5 40.5H38.5C38.5 33 39 25.5 39.5 19Z"
            />
            <rect x="23" y="81" width="26" height="4" rx="2" />
            <rect x="27" y="89" width="18" height="4" rx="2" />
          </g>
          <text
            x={PARENT.x}
            y={PARENT.y + 66}
            textAnchor="middle"
            className="fill-fg-slate-muted text-[10px] uppercase"
            style={{ letterSpacing: "0.14em" }}
          >
            Suez Group
          </text>
        </g>

        {/* Operating companies */}
        {NODES.map((n) => (
          <g key={n.label} className="dg-node" style={{ animationDelay: `${n.delay + 260}ms` }}>
            <circle cx={n.x} cy={CHILD_Y} r={9} fill={n.color} />
            <circle cx={n.x} cy={CHILD_Y} r={19} stroke={n.color} strokeOpacity={0.3} fill="none" />
            <text
              x={n.x}
              y={CHILD_Y + 52}
              textAnchor="middle"
              className="fill-fg-slate font-display text-[19px]"
            >
              {n.label}
            </text>
            <text
              x={n.x}
              y={CHILD_Y + 76}
              textAnchor="middle"
              className="text-[10px] uppercase"
              fill={n.color}
              style={{ letterSpacing: "0.14em" }}
            >
              {n.sector}
            </text>
            <text
              x={n.x}
              y={CHILD_Y + 96}
              textAnchor="middle"
              className="fill-fg-slate-muted text-[10px] uppercase"
              style={{ letterSpacing: "0.1em" }}
            >
              {n.meta}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
