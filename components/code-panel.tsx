/**
 * Suez Software, drawn rather than photographed.
 *
 * The Software card used to show a screenshot of the Suez Trading storefront,
 * which is Trading's product, not Software's. Software's work IS the code, so
 * the card now renders code: deterministic, server-rendered, no image, and
 * legible at card size because the type is set rather than photographed.
 *
 * The snippet is the real shape of the vending path — eleven discos behind one
 * interface, a retry, a receipt — not lorem ipsum with syntax colours.
 */

type Tone = "key" | "fn" | "str" | "num" | "com" | "punc" | "plain";
type Segment = [Tone, string];

const LINES: Segment[][] = [
  [["com", "// vending/token.ts — one interface, eleven discos"]],
  [],
  [
    ["key", "export async function"],
    ["plain", " "],
    ["fn", "vend"],
    ["punc", "("],
    ["plain", "order"],
    ["punc", ":"],
    ["plain", " Order"],
    ["punc", ") {"],
  ],
  [
    ["plain", "  "],
    ["key", "const"],
    ["plain", " disco "],
    ["punc", "="],
    ["plain", " "],
    ["fn", "route"],
    ["punc", "("],
    ["plain", "order"],
    ["punc", "."],
    ["plain", "meter"],
    ["punc", ");"],
  ],
  [
    ["plain", "  "],
    ["key", "const"],
    ["plain", " token "],
    ["punc", "="],
    ["plain", " "],
    ["key", "await"],
    ["plain", " disco"],
    ["punc", "."],
    ["fn", "request"],
    ["punc", "("],
    ["plain", "order"],
    ["punc", ");"],
  ],
  [
    ["plain", "  "],
    ["key", "if"],
    ["plain", " "],
    ["punc", "(!"],
    ["plain", "token"],
    ["punc", "."],
    ["plain", "ok"],
    ["punc", ")"],
    ["plain", " "],
    ["key", "return"],
    ["plain", " "],
    ["fn", "retry"],
    ["punc", "("],
    ["plain", "order"],
    ["punc", ","],
    ["plain", " disco"],
    ["punc", ");"],
  ],
  [],
  [
    ["plain", "  "],
    ["key", "await"],
    ["plain", " receipt"],
    ["punc", "."],
    ["fn", "write"],
    ["punc", "({ ..."],
    ["plain", "order"],
    ["punc", ", "],
    ["plain", "token"],
    ["punc", " });"],
  ],
  [
    ["plain", "  "],
    ["key", "return"],
    ["plain", " token"],
    ["punc", ";"],
    ["plain", "   "],
    ["com", "// median "],
    ["num", "14"],
    ["com", "s, end to end"],
  ],
  [["punc", "}"]],
];

export function CodePanel({
  file = "suez-software / vending/token.ts",
  className = "",
}: {
  file?: string;
  className?: string;
}) {
  return (
    <div className={`code-panel ${className}`} aria-hidden="true">
      <div className="code-panel-chrome">
        <i />
        <i />
        <i />
        <span>{file}</span>
      </div>
      <pre className="code-panel-body">
        <code>
          {LINES.map((line, i) => (
            <span className="code-line" key={i}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>
                {line.map(([tone, text], j) => (
                  <span key={j} className={`c-${tone}`}>
                    {text}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
