/** Docs navigation + shared URLs. GitHub URL re-exported from the site-wide module. */

import { GITHUB_URL } from "@/lib/links";

export { GITHUB_URL };
export const DOCS_URL = "https://www.projectvex.ai/docs";
export const SITE_URL = "https://www.projectvex.ai";

export interface NavItem {
  /** Route slug under /docs. "" is the /docs index (Overview). */
  slug: string;
  label: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const DOCS_NAV: NavGroup[] = [
  {
    group: "Start Here",
    items: [
      { slug: "", label: "Overview" },
      { slug: "quickstart", label: "Quickstart" },
      { slug: "setup", label: "Installation & Setup" },
    ],
  },
  {
    group: "Concepts",
    items: [
      { slug: "architecture", label: "Architecture" },
      { slug: "team", label: "The Desk Team" },
      { slug: "workflow", label: "The Desk Run" },
    ],
  },
  {
    group: "Safety",
    items: [
      { slug: "guardrails", label: "Guardrails" },
      { slug: "prompt-injection", label: "Prompt-Injection Defense" },
      { slug: "strategies", label: "Strategies & Risk" },
    ],
  },
  {
    group: "Reference",
    items: [
      { slug: "configuration", label: "Configuration" },
      { slug: "mcp", label: "MCP & Tools" },
      { slug: "dashboard", label: "Dashboard" },
      { slug: "backtesting", label: "Backtester" },
      { slug: "logging", label: "Audit Logging" },
    ],
  },
  {
    group: "More",
    items: [
      { slug: "faq", label: "FAQ" },
      { slug: "glossary", label: "Glossary" },
      { slug: "disclaimer", label: "Safety & Disclaimer" },
    ],
  },
];

/** Flattened, ordered page list — drives prev/next. */
export const DOCS_ORDER: NavItem[] = DOCS_NAV.flatMap((g) => g.items);

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function prevNext(slug: string): { prev?: NavItem; next?: NavItem } {
  const i = DOCS_ORDER.findIndex((n) => n.slug === slug);
  if (i === -1) return {};
  return { prev: DOCS_ORDER[i - 1], next: DOCS_ORDER[i + 1] };
}
