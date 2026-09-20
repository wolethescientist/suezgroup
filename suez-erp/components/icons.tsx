// ponytail: one <svg> + a path table beats an icon dependency for 20 glyphs.
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  chat: "M21 12a8 8 0 0 1-8 8H8.5L3.5 22l1.4-4.2A8 8 0 1 1 21 12Z",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  workflow: "M4 13h4l2 3h4l2-3h4M4 13 6 5h12l2 8v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m6.5-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.9M15 4.1a3.5 3.5 0 0 1 0 6.8",
  building: "M4 21V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M14 10h5a1 1 0 0 1 1 1v10M3 21h18M7 9h3M7 13h3M7 17h3M17 14h1M17 18h1",
  contact: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 17c0-1.7 1.3-3 3-3s3 1.3 3 3m3-8h4m-4 4h4",
  trending: "M3 17l6-6 4 4 8-8m0 0h-5m5 0v5",
  check: "M9 12l2 2 4-4m-3 10a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
  bell: "M15 17H9m9 0a2 2 0 0 0 1.9-2.6L19 12V9a7 7 0 1 0-14 0v3l-.9 2.4A2 2 0 0 0 6 17h9Zm-1 0a2 2 0 1 1-4 0",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.3-1.8.1-1.2-.1-1.2 1.8-1.4-1.8-3.1-2.1.9a7.5 7.5 0 0 0-2-1.2L14.8 3H9.2l-.4 2.2a7.5 7.5 0 0 0-2 1.2l-2.1-.9-1.8 3.1 1.8 1.4-.1 1.2.1 1.2-1.8 1.4 1.8 3.1 2.1-.9a7.5 7.5 0 0 0 2 1.2l.4 2.2h5.6l.4-2.2a7.5 7.5 0 0 0 2-1.2l2.1.9 1.8-3.1-1.8-1.4Z",
  shield: "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6l8-3Zm-3 9 2 2 4-4",
  pen: "M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Zm10.5-14 4 4",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  book: "M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Zm4-2v18",
  plus: "M12 5v14M5 12h14",
  search: "M20 20l-4.5-4.5M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  logout: "M15 12H3m4-4-4 4 4 4m6-9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1",
  menu: "M4 7h16M4 12h16M4 17h16",
  clip: "M15.5 8.5l-6 6a2.1 2.1 0 0 0 3 3l6.5-6.5a4.2 4.2 0 0 0-6-6L6 11.5a6.4 6.4 0 0 0 9 9l3.5-3.5",
  send: "M4 12l16-8-6 16-3-6-7-2Z",
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 1 8 6 8-6",
  chart: "M4 20V9m5 11V4m5 16v-7m5 7V7",
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  cash: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm9 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  receipt: "M6 3h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Zm3 5h6M9 12h6M9 16h3",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18m8-13.5L12 12 4 7.5",
  cart: "M3 4h2l2.5 11h10L20 7H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  truck: "M3 7h10v9H3V7Zm10 3h4l3 3v3h-7v-6ZM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  target: "M12 12h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
  inbox: "M3 13h5l2 3h4l2-3h5M4 13 6 5h12l2 8v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2",
  star: "M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8L12 4Z",
  wrench: "M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.8 2.8 0 0 1-4-4l8-8a4 4 0 0 0-1 1Z",
  tag: "M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Zm4-5h.01",
  // Document editor toolbar.
  bold: "M7 5h5.5a3.5 3.5 0 0 1 0 7H7V5Zm0 7h6.5a3.5 3.5 0 0 1 0 7H7v-7Z",
  italic: "M19 5h-8M13 19H5M15 5 9 19",
  underline: "M6 4v6a6 6 0 0 0 12 0V4M5 20h14",
  strikethrough: "M4 12h16M16.5 8c0-1.9-2-3-4.5-3S7.5 6.1 7.5 8c0 1.4 1 2.3 2.6 2.9M7.5 16c0 1.9 2 3 4.5 3s4.5-1.1 4.5-3",
  "list-bullet": "M9 6h11M9 12h11M9 18h11M4.6 6h.01M4.6 12h.01M4.6 18h.01",
  "list-number": "M10 6h10M10 12h10M10 18h10M4 5h1.5v4M3.5 9h3M3.5 12.5h2.5l-2.5 3h3",
  quote: "M9 7H6a2 2 0 0 0-2 2v3h5V7Zm0 0v4a5 5 0 0 1-3 4.6M20 7h-3a2 2 0 0 0-2 2v3h5V7Zm0 0v4a5 5 0 0 1-3 4.6",
  "align-left": "M4 6h16M4 12h10M4 18h13",
  "align-center": "M4 6h16M7 12h10M6 18h12",
  "align-right": "M4 6h16M10 12h10M7 18h13",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5",
  eraser: "M8 20H5l-1.5-1.5a2 2 0 0 1 0-3L13 6a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L13 20H8Zm-2-7 7 7",
  history: "M3.5 12a8.5 8.5 0 1 0 2.8-6.3M3.5 4v4h4M12 8v4.5l3 1.8",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  download: "M12 4v12m-5-5 5 5 5-5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2",
  // Word-processor toolbar.
  undo: "M9 10H5V6m0 4 3-3a7 7 0 1 1-1 9",
  redo: "M15 10h4V6m0 4-3-3a7 7 0 1 0 1 9",
  "align-justify": "M4 6h16M4 12h16M4 18h16",
  indent: "M4 6h16M10 12h10M4 18h16M4 10l3 2-3 2v-4Z",
  outdent: "M4 6h16M10 12h10M4 18h16M7 10l-3 2 3 2v-4Z",
  table: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 5h17M4 15h17M9.5 10v9M15 10v9",
  "text-colour": "M6 19h12M8.5 15 12 5l3.5 10M9.7 12h4.6",
  highlight: "M4 20h6m-3.5-3.5L4 17l.6-2.6 8-8a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3l-8 8Z",
  "line-height": "M4 5v14m-2-12 2-2 2 2M2 17l2 2 2-2M9 6h12M9 12h12M9 18h12",
  superscript: "M4 6l8 12M12 6 4 18m13-8V5.5c0-1 2.5-1 2.5 0S17 8 17 10h3",
  subscript: "M4 4l8 12M12 4 4 16m13 4v-1.5c0-1 2.5-1 2.5 0S17 21 17 21h3",
  "horizontal-rule": "M4 12h16M7 7h10M7 17h10",
  "page-break": "M5 8V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3M3 12h3m3 0h2m3 0h2m3 0h3",
  find: "M20 20l-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM8 11h6",
  image: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 11 5-5 4 4 3-2 5 4M9 9.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  print: "M7 9V4h10v5M7 18H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M7 15h10v5H7v-5Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
