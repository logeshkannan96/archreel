import { describe, expect, it } from "vitest";
import { fromMermaid, type MermaidResult } from "./index.js";

const ok = (r: MermaidResult) => {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r;
};
const chart = (body: string) => ok(fromMermaid(`flowchart LR\n${body}`));
const issues = (source: string): string[] => {
  const r = fromMermaid(source);
  return r.ok ? [] : r.issues.map((i) => `${i.line}: ${i.message}`);
};

describe("fromMermaid", () => {
  it("converts nodes, subgraphs, links and labels into a staged spec", () => {
    const r = ok(
      fromMermaid(`%% checkout
flowchart LR
  user((Customer)) -->|HTTPS| lb[Load Balancer]
  lb --> api[Checkout API]:::svc
  subgraph data["Data tier"]
    api -- "SELECT order" --> db[(Orders)]
  end
  api --> lb
`),
    );
    expect(r.spec).toEqual({
      version: 1,
      nodes: [
        { id: "user", label: "Customer", icon: "user" },
        { id: "lb", label: "Load Balancer", icon: "aws/alb" },
        { id: "api", label: "Checkout API", icon: "server", group: "data" },
        { id: "db", label: "Orders", icon: "database", group: "data" },
      ],
      groups: [{ id: "data", label: "Data tier" }],
      edges: [
        { from: "user", to: "lb", label: "HTTPS" },
        { from: "lb", to: "api" },
        { from: "api", to: "db", label: "SELECT order" },
      ],
      steps: [
        { reveal: ["user"] },
        { flow: { from: "user", to: "lb" } },
        { flow: { from: "lb", to: "api" } },
        { flow: { from: "api", to: "db" } },
        // A link back along an edge is a response on that edge.
        { flow: { from: "api", to: "lb" } },
      ],
    });
    expect(r.warnings).toEqual([]);
  });

  it("reads every node shape's label", () => {
    const shapes = [
      "a[box]",
      "b(round)",
      "c([stadium])",
      "d[[sub]]",
      "e[(cyl)]",
      "f((circle))",
      "g{rhombus}",
      "h{{hex}}",
      "i>flag]",
      "j[/para/]",
      "k[\\alt\\]",
      "l[/trap\\]",
      "m(((double)))",
      'n["quoted [x]"]',
    ];
    const r = chart(shapes.join("\n"));
    expect(r.spec.nodes.map((n) => n.label)).toEqual([
      "box",
      "round",
      "stadium",
      "sub",
      "cyl",
      "circle",
      "rhombus",
      "hex",
      "flag",
      "para",
      "alt",
      "trap",
      "double",
      "quoted [x]",
    ]);
  });

  it("reads every link style and label form", () => {
    const r = chart(
      [
        "a --> b",
        "b --- c",
        "c -.-> d",
        "d ==> e",
        "e --o f",
        "f --x g",
        "g <--> h",
        "h -->|pipe| i",
        "i -- text --> j",
        "j == thick ==> k",
        "k -. dotted .-> l",
        "l ~~~ m",
        "m ---->n",
      ].join("\n"),
    );
    expect(r.spec.edges?.map((e) => [e.from, e.to, e.label])).toEqual([
      ["a", "b", undefined],
      ["b", "c", undefined],
      ["c", "d", undefined],
      ["d", "e", undefined],
      ["e", "f", undefined],
      ["f", "g", undefined],
      ["g", "h", undefined],
      ["h", "i", "pipe"],
      ["i", "j", "text"],
      ["j", "k", "thick"],
      ["k", "l", "dotted"],
      // `l ~~~ m` is invisible: no edge
      ["m", "n", undefined],
    ]);
  });

  it("expands chains and & groups", () => {
    const r = chart("a --> b & c --> d; d --> a");
    expect(r.spec.edges?.map((e) => `${e.from}->${e.to}`)).toEqual([
      "a->b",
      "a->c",
      "b->d",
      "c->d",
      "d->a",
    ]);
  });

  it("cleans label markup", () => {
    const r = chart('a["Line 1<br/>Line 2 #amp; <b>more</b>"] --> b');
    expect(r.spec.nodes[0]?.label).toBe("Line 1 Line 2 & more");
  });

  it("makes ids archreel-safe and unique", () => {
    const r = chart("1 --> 2\nsvc_a --> svc-b");
    expect(r.spec.nodes.map((n) => [n.id, n.label])).toEqual([
      ["n", "1"],
      ["n_2", "2"],
      ["svc_a", undefined],
      ["svc-b", undefined],
    ]);
  });

  it("guesses icons from names, treating cylinders as storage", () => {
    const r = chart("users[(users)] --> redis[Redis] --> mq[Orders queue] --> web[Web App]");
    expect(r.spec.nodes.map((n) => n.icon)).toEqual(["database", "redis", "queue", "server"]);
  });

  it("warns about what it skips", () => {
    const r = ok(
      fromMermaid(`graph TD
  subgraph outer
    subgraph inner
      a --> b
    end
  end
  a --> inner
  b --> b
  style a fill:#f9f
  style b fill:#f9f`),
    );
    expect(r.warnings.map((w) => `${w.line}: ${w.message}`)).toEqual([
      "1: direction TD is ignored; archreel lays out left to right",
      "3: nested subgraphs are drawn side by side, not inside each other",
      '9: "style" lines are ignored; use a theme to style the video',
      '2: subgraph "outer" has no nodes of its own; skipped',
      '7: link to subgraph "inner" skipped; link its nodes instead',
      '8: self-link on "b" skipped',
    ]);
    expect(r.spec.groups).toEqual([{ id: "inner" }]);
  });

  it("fails fast on a line full of unclosed shapes", () => {
    const start = performance.now();
    expect(fromMermaid(`flowchart LR\n${"a[ & ".repeat(150_000)}`).ok).toBe(false);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it.each([
    [
      "another diagram type",
      "sequenceDiagram\nA->>B: hi",
      ['1: expected "flowchart LR" or "graph TD" — only Mermaid flowcharts can be imported'],
    ],
    [
      "an unclosed subgraph",
      "flowchart LR\nsubgraph s\na --> b",
      ['2: subgraph "s" is never closed'],
    ],
    ["a stray end", "flowchart LR\na --> b\nend", ['3: "end" without a subgraph']],
    [
      "unsupported syntax, with its line",
      "flowchart LR\na --> b\na@{ shape: cyl }",
      ['3: can\'t parse "@{ shape: cyl }" (archreel imports nodes, links and subgraphs)'],
    ],
    [
      "an unclosed link label",
      "flowchart LR\na -- oops b",
      ['2: link label "oops b" has no closing arrow'],
    ],
    ["an empty diagram", "%% nothing", ["0: empty diagram"]],
  ])("rejects %s", (_name, source, expected) => {
    expect(issues(source)).toEqual(expected);
  });
});
