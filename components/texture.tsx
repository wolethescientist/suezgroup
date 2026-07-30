/**
 * Texture for the group site. Deliberately NOT the sibling systems:
 *   · SuezElectric uses contour topography + banknote guilloche
 *   · Suez Gas uses contours + burner rings
 *   · Suez Group uses a NETWORK WEB + STRATA bands
 *
 * A holding company is a set of related parts, so the primary background is a
 * literal network: nodes on a phyllotaxis spiral, linked to their neighbours.
 * All deterministic, all server-rendered, no images.
 */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

type Node = { x: number; y: number; i: number };

function spiralNodes(count: number, spread: number, squash: number): Node[] {
  return Array.from({ length: count }, (_, i) => {
    const r = spread * Math.sqrt(i + 0.6);
    const a = i * GOLDEN;
    return { x: 600 + Math.cos(a) * r, y: 500 + Math.sin(a) * r * squash, i };
  });
}

/**
 * Network web. Each node links back to its immediate predecessor and to one
 * further back, which is what turns a scatter of points into a connected mesh.
 */
export function Web({
  origin = { x: 62, y: 38 },
  nodes: count = 190,
  className = "",
  tone = "slate",
  opacity = 1,
}: {
  origin?: { x: number; y: number };
  nodes?: number;
  className?: string;
  tone?: "slate" | "paper";
  opacity?: number;
}) {
  const stroke = tone === "slate" ? "#46536280" : "#bdb3a180";
  const node = tone === "slate" ? "#5b6b7d" : "#ab9f89";
  const pts = spiralNodes(count, 46, 0.72);

  const links: { a: Node; b: Node; o: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const fade = 1 - i / pts.length; // the web thins as it spreads outward
    links.push({ a: pts[i], b: pts[i - 1], o: 0.5 * fade });
    if (i > 8) links.push({ a: pts[i], b: pts[i - 8], o: 0.32 * fade });
  }

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        className="absolute h-[170%] w-[170%] max-w-none"
        style={{
          left: `${origin.x}%`,
          top: `${origin.y}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <svg
          className="web-drift h-full w-full"
          viewBox="0 0 1200 1000"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          {links.map((l, i) => (
            <line
              key={i}
              x1={l.a.x.toFixed(1)}
              y1={l.a.y.toFixed(1)}
              x2={l.b.x.toFixed(1)}
              y2={l.b.y.toFixed(1)}
              stroke={stroke}
              strokeWidth={0.7}
              strokeOpacity={l.o * opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {pts.map((p) => {
            const fade = 1 - p.i / pts.length;
            // Every 11th node is a "hub" and reads slightly heavier
            const hub = p.i % 11 === 0;
            return (
              <circle
                key={p.i}
                cx={p.x.toFixed(1)}
                cy={p.y.toFixed(1)}
                r={hub ? 2.6 : 1.2}
                fill={node}
                fillOpacity={(hub ? 0.8 : 0.45) * fade * opacity}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * Strata — horizontal hairlines whose spacing tightens and loosens like a
 * geological section or a spectrum readout. Used where the web would be too busy.
 */
export function Strata({
  className = "",
  tone = "slate",
  lines = 54,
  opacity = 1,
}: {
  className?: string;
  tone?: "slate" | "paper";
  lines?: number;
  opacity?: number;
}) {
  const stroke = tone === "slate" ? "#465362" : "#bdb3a1";
  const bands = Array.from({ length: lines }, (_, i) => {
    const t = i / lines;
    // Cubic easing packs the lines toward the base, so it reads as sediment
    const y = 1000 * Math.pow(t, 1.7);
    const heavy = i % 7 === 0;
    return { y, o: (0.5 - t * 0.34) * (heavy ? 1.6 : 1) * opacity, w: heavy ? 1.3 : 0.7 };
  });

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1200 1000"
        fill="none"
        preserveAspectRatio="none"
      >
        {bands.map((b, i) => (
          <line
            key={i}
            x1="0"
            y1={b.y.toFixed(1)}
            x2="1200"
            y2={b.y.toFixed(1)}
            stroke={stroke}
            strokeWidth={b.w}
            strokeOpacity={b.o}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

/** Fixed film grain, the one finish shared across all three group sites. */
export function Grain() {
  return (
    <svg aria-hidden="true" className="grain" width="100%" height="100%">
      <filter id="suezgroup-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.8"
          numOctaves={3}
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#suezgroup-grain)" />
    </svg>
  );
}
