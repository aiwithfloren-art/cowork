/**
 * Connector registry — single source of truth for which third-party
 * integrations Sigap supports. Adding a new connector = append an
 * entry here, create the install + callback routes (OAuth) or a
 * paste-token install route, and add a buildXxxTools() that
 * build-tools.ts can splice into the main tool list.
 */
export type ConnectorStatus = "available" | "coming-soon";

export type ConnectorAuthType = "oauth_login" | "oauth_redirect" | "paste_token";

export type ConnectorSpec = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category:
    | "communication"
    | "docs"
    | "project"
    | "finance"
    | "calendar"
    | "google"
    | "design";
  scopes: string[];
  capabilities: string[];
  status: ConnectorStatus;
  authType: ConnectorAuthType;
  installUrl?: string;
  // For paste_token connectors: where the user creates the token + how
  pasteTokenGuide?: {
    label: string; // e.g. "Internal Integration Secret"
    createUrl: string; // direct link to vendor's token page
    instructions: string; // 1-2 line instructions shown above paste field
  };
  // Marketplace display
  popularity?: number; // 1 = most popular
  toolsCount?: number; // for "Gmail · 6 tools" badge
};

export const CONNECTORS: ConnectorSpec[] = [
  {
    slug: "canva",
    name: "Canva",
    description:
      "Search designs, autofill brand templates, and export to PNG/PDF/MP4 — straight from chat.",
    icon: "🎨",
    category: "design",
    scopes: [
      "design:meta:read",
      "design:content:read",
      "design:content:write",
      "asset:read",
      "asset:write",
      "brandtemplate:meta:read",
      "brandtemplate:content:read",
      "folder:read",
    ],
    capabilities: [
      "Cari design existing di akun",
      "Autofill 5 carousel dari brand template sekaligus",
      "Export design ke PNG/PDF",
      "Bikin design baru dengan ukuran custom",
      "Upload foto produk ke asset library",
    ],
    status: "available",
    authType: "oauth_redirect",
    installUrl: "/api/connectors/canva/install",
    popularity: 1,
    toolsCount: 6,
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Read your inbox, search threads, send emails, and create drafts.",
    icon: "📧",
    category: "google",
    scopes: ["gmail.readonly", "gmail.send"],
    capabilities: [
      "Cek email terbaru",
      "Cari email dari orang tertentu",
      "Kirim email + bikin draft",
      "Ringkas thread panjang",
    ],
    status: "available",
    authType: "oauth_login",
    popularity: 2,
    toolsCount: 5,
  },
  {
    slug: "google_calendar",
    name: "Google Calendar",
    description: "Manage your schedule and coordinate meetings effortlessly.",
    icon: "📅",
    category: "google",
    scopes: ["calendar.events"],
    capabilities: [
      "Cek jadwal hari ini / minggu ini",
      "Bikin event baru + invite peserta",
      "Cari slot kosong",
      "Update / hapus event",
    ],
    status: "available",
    authType: "oauth_login",
    popularity: 2,
    toolsCount: 5,
  },
  {
    slug: "google_drive",
    name: "Google Drive",
    description: "Search, read, and create files instantly.",
    icon: "📁",
    category: "google",
    scopes: ["drive.file"],
    capabilities: [
      "Cari file di Drive",
      "Baca isi dokumen / spreadsheet",
      "Bikin Google Doc baru dari chat",
    ],
    status: "available",
    authType: "oauth_login",
    popularity: 3,
    toolsCount: 4,
  },
  {
    slug: "google_tasks",
    name: "Google Tasks",
    description: "Add, complete, and organize your tasks.",
    icon: "✅",
    category: "google",
    scopes: ["tasks"],
    capabilities: [
      "List todo + yang overdue",
      "Tambah task dengan due date",
      "Mark task selesai",
    ],
    status: "available",
    authType: "oauth_login",
    popularity: 6,
    toolsCount: 4,
  },
  {
    slug: "github",
    name: "GitHub",
    description:
      "Create repos, push code, open PRs, and review commits across your repositories.",
    icon: "🐙",
    category: "project",
    scopes: ["repo", "read:org", "user:email"],
    capabilities: [
      "Bikin repo baru + push code full project",
      "Review commit 24 jam terakhir + post PR comment",
      "Baca file + diff dari repo manapun",
    ],
    status: "available",
    authType: "oauth_redirect",
    installUrl: "/api/connectors/github/install",
    popularity: 4,
    toolsCount: 6,
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Search pages, read content, and create or append to pages in your workspace.",
    icon: "📝",
    category: "docs",
    scopes: ["read_content", "update_content", "insert_content"],
    capabilities: [
      "Cari halaman di workspace",
      "Baca isi page lengkap",
      "Bikin page baru di parent",
      "Append content ke page existing",
    ],
    status: "available",
    authType: "paste_token",
    installUrl: "/api/connectors/notion/install",
    pasteTokenGuide: {
      label: "Internal Integration Secret",
      createUrl: "https://www.notion.so/profile/integrations",
      instructions:
        "Buka link → klik 'New integration' → pilih workspace → copy 'Internal Integration Secret' → paste di sini. Setelah connect, share page yang mau diakses ke integrasi-nya.",
    },
    popularity: 5,
    toolsCount: 4,
  },
  {
    slug: "linear",
    name: "Linear",
    description:
      "List, create, and update issues across your Linear teams.",
    icon: "📋",
    category: "project",
    scopes: ["read", "write"],
    capabilities: [
      "List issue per team / status",
      "Bikin issue baru + assign",
      "Update status issue",
      "List semua team",
    ],
    status: "available",
    authType: "paste_token",
    installUrl: "/api/connectors/linear/install",
    pasteTokenGuide: {
      label: "Personal API Key",
      createUrl: "https://linear.app/settings/api",
      instructions:
        "Buka link → 'Create new API key' → kasih nama 'Sigap' → copy key → paste di sini.",
    },
    popularity: 7,
    toolsCount: 4,
  },
  {
    slug: "slack",
    name: "Slack",
    description:
      "Post messages, list channels, and search discussions across your workspace.",
    icon: "💬",
    category: "communication",
    scopes: ["channels:read", "chat:write", "search:read", "users:read"],
    capabilities: [
      "Kirim update ke #general",
      "List channel yang lo bisa post",
      "Cari diskusi tim di Slack",
    ],
    status: "available",
    authType: "oauth_redirect",
    installUrl: "/api/connectors/slack/install",
    popularity: 8,
    toolsCount: 4,
  },
];

export function getConnector(slug: string): ConnectorSpec | undefined {
  return CONNECTORS.find((c) => c.slug === slug);
}

// Helper: Google sub-services share one OAuth — connection state for any
// of them comes from google_tokens row, not from the connectors table.
export const GOOGLE_SUBSERVICES = new Set([
  "gmail",
  "google_calendar",
  "google_drive",
  "google_tasks",
]);
