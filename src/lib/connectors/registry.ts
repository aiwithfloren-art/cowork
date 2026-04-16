/**
 * Connector registry — single source of truth for which third-party
 * integrations Sigap supports. Adding a new connector = append an
 * entry here, create an OAuth route pair at
 * /api/connectors/{slug}/install and /api/connectors/{slug}/callback,
 * and add a buildXxxTools() in src/lib/llm/<slug>/tools.ts that
 * getConnectorTools() can splice into the main tool list.
 */
export type ConnectorStatus = "available" | "coming-soon";

export type ConnectorSpec = {
  slug: string;
  name: string;
  description: string;
  icon: string; // emoji for now; replace with real logos later
  category: "communication" | "docs" | "project" | "finance" | "calendar";
  scopes: string[]; // for display; real OAuth flow configures separately
  capabilities: string[]; // what the user can ask Sigap to do
  status: ConnectorStatus;
  installUrl?: string; // /api/connectors/<slug>/install
};

export const CONNECTORS: ConnectorSpec[] = [
  {
    slug: "google",
    name: "Google Workspace",
    description: "Calendar, Gmail, Tasks, Drive — connected via sign-in.",
    icon: "🟦",
    category: "calendar",
    scopes: [
      "calendar.events",
      "tasks",
      "gmail.readonly",
      "gmail.send",
      "drive.file",
    ],
    capabilities: [
      "Read + edit calendar events",
      "Add/complete/edit tasks",
      "Read inbox + send emails",
      "Read picked Drive files",
    ],
    status: "available",
  },
  {
    slug: "slack",
    name: "Slack",
    description:
      "Post messages, read channel history, search for context across your workspace.",
    icon: "🟣",
    category: "communication",
    scopes: ["channels:read", "chat:write", "search:read", "users:read"],
    capabilities: [
      "Kirim update ke #general",
      "Baca thread kemarin soal launch",
      "Search diskusi tim",
    ],
    status: "coming-soon",
    installUrl: "/api/connectors/slack/install",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Search and update pages across your Notion workspace.",
    icon: "⬛",
    category: "docs",
    scopes: ["read_content", "update_content", "insert_content"],
    capabilities: [
      "Cari notes di Notion",
      "Update page roadmap",
      "Bikin page baru dari chat",
    ],
    status: "coming-soon",
    installUrl: "/api/connectors/notion/install",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Create, assign, and query issues across your Linear teams.",
    icon: "🟪",
    category: "project",
    scopes: ["read", "write"],
    capabilities: [
      "Bikin issue baru dengan deskripsi lengkap",
      "Assign issue ke teammate",
      "Cek issue yang blocked",
    ],
    status: "coming-soon",
    installUrl: "/api/connectors/linear/install",
  },
  {
    slug: "stripe",
    name: "Stripe",
    description:
      "Read-only access to revenue, customers, and churn metrics.",
    icon: "🟩",
    category: "finance",
    scopes: ["read_only"],
    capabilities: [
      "MRR bulan ini berapa",
      "Churn minggu ini",
      "Customer list teratas",
    ],
    status: "coming-soon",
    installUrl: "/api/connectors/stripe/install",
  },
  {
    slug: "github",
    name: "GitHub",
    description: "Open PRs, issues, and repo context for devs.",
    icon: "⚫",
    category: "project",
    scopes: ["repo", "read:org"],
    capabilities: [
      "PR apa yang nungguin review",
      "Issue yang gue assign",
      "Summary activity repo",
    ],
    status: "coming-soon",
    installUrl: "/api/connectors/github/install",
  },
];

export function getConnector(slug: string): ConnectorSpec | undefined {
  return CONNECTORS.find((c) => c.slug === slug);
}
