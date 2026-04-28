import { readFileSync } from "node:fs";

const envFile = readFileSync("/Users/florentini/OpenSource Cowork/.env.local", "utf-8");
const env = Object.fromEntries(
  envFile.split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => {
    const idx = l.indexOf("=");
    return [l.slice(0, idx), l.slice(idx + 1)];
  }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

async function listFolder(prefix, limit = 10) {
  const res = await fetch(`${url}/storage/v1/object/list/sigap-images`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit, sortBy: { column: "created_at", order: "desc" } }),
  });
  return res.ok ? await res.json() : [];
}

async function listRecursive(prefix, depth = 0) {
  if (depth > 4) return;
  const items = await listFolder(prefix, 50);
  for (const item of items) {
    const fullPath = `${prefix}${item.name}`;
    const isFolder = item.id === null && !item.metadata;
    console.log(`${"  ".repeat(depth)}${isFolder ? "📁" : "📄"} ${item.name}${item.metadata?.size != null ? ` (${item.metadata.size} bytes)` : ""}`);
    if (isFolder) await listRecursive(`${fullPath}/`, depth + 1);
  }
}

console.log("=== Bucket sigap-images contents ===");
await listRecursive("carousel/");
