/* eslint-disable */
/**
 * Automates Slack app manifest + Vercel env vars + Vercel redeploy.
 *
 * What it does:
 *   1. Applies the app manifest to your Slack app via apps.manifest.update
 *      → sets OAuth scopes, redirect URL, event subscriptions in one call
 *   2. Reads Slack Client ID + Secret + Signing Secret (you paste them in)
 *   3. Pushes all three to Vercel env vars via Vercel REST API
 *   4. Triggers a Vercel redeploy on the main branch
 *
 * What stays manual (Slack has no API for these):
 *   - Toggle "Activate Public Distribution" (1 click in Slack dashboard)
 *   - Rotate Client Secret (1 click in Slack → Basic Information)
 *
 * Usage:
 *   SLACK_CONFIG_TOKEN=xoxe.xoxp-... \
 *   SLACK_APP_ID=A0AUBBNFE2C \
 *   SLACK_CLIENT_ID=... \
 *   SLACK_CLIENT_SECRET=... \
 *   SLACK_SIGNING_SECRET=... \
 *   VERCEL_TOKEN=... \
 *   VERCEL_PROJECT_ID=... \
 *   npx tsx scripts/setup-slack-auto.ts
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const required = [
  "SLACK_CONFIG_TOKEN",
  "SLACK_APP_ID",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

const {
  SLACK_CONFIG_TOKEN,
  SLACK_APP_ID,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_SIGNING_SECRET,
  VERCEL_TOKEN,
  VERCEL_PROJECT_ID,
} = process.env as Record<string, string>;

async function main() {
  // ===== 1. Apply Slack App Manifest =====
  console.log("📋 Reading local manifest…");
  const manifestYaml = fs.readFileSync(
    path.join(process.cwd(), "slack-app-manifest.yaml"),
    "utf-8",
  );
  const manifest = yaml.parse(manifestYaml);
  console.log("✓ manifest parsed");

  console.log("🔄 Applying manifest to Slack app via apps.manifest.update…");
  const slackRes = await fetch("https://slack.com/api/apps.manifest.update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_CONFIG_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ app_id: SLACK_APP_ID, manifest }),
  });
  const slackData = (await slackRes.json()) as {
    ok: boolean;
    error?: string;
    errors?: unknown;
    permissions_updated?: boolean;
  };
  if (!slackData.ok) {
    console.error("✗ Slack manifest update failed:", JSON.stringify(slackData, null, 2));
    process.exit(1);
  }
  console.log(
    "✓ Slack manifest applied" +
      (slackData.permissions_updated
        ? " (permissions changed — you'll need to reinstall in Slack UI)"
        : ""),
  );

  // ===== 2. Set Vercel Env Vars =====
  console.log("\n⚡ Setting Vercel environment variables…");
  const envVars = [
    { key: "SLACK_CLIENT_ID", value: SLACK_CLIENT_ID, sensitive: false },
    { key: "SLACK_CLIENT_SECRET", value: SLACK_CLIENT_SECRET, sensitive: true },
    { key: "SLACK_SIGNING_SECRET", value: SLACK_SIGNING_SECRET, sensitive: true },
  ];

  for (const { key, value, sensitive } of envVars) {
    // Check if exists first; if so, delete then re-create (simpler than PATCH)
    const listRes = await fetch(
      `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
    );
    const listData = (await listRes.json()) as {
      envs?: Array<{ id: string; key: string }>;
    };
    const existing = listData.envs?.find((e) => e.key === key);
    if (existing) {
      await fetch(
        `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${existing.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        },
      );
    }

    const createRes = await fetch(
      `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          value,
          type: sensitive ? "sensitive" : "encrypted",
          target: ["production", "preview", "development"],
        }),
      },
    );
    const createData = (await createRes.json()) as { error?: { message?: string } };
    if (createData.error) {
      console.error(`✗ ${key}:`, createData.error.message);
      process.exit(1);
    }
    console.log(`✓ ${key} set`);
  }

  // ===== 3. Trigger redeploy =====
  console.log("\n🚀 Triggering Vercel redeploy…");
  const projRes = await fetch(
    `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
  );
  const proj = (await projRes.json()) as {
    name?: string;
    link?: { type?: string; repo?: string; repoId?: number };
    latestDeployments?: Array<{ meta?: { githubCommitRef?: string } }>;
  };

  const latestBranch =
    proj.latestDeployments?.[0]?.meta?.githubCommitRef ?? "main";

  const deployRes = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: proj.name,
      project: VERCEL_PROJECT_ID,
      target: "production",
      gitSource: {
        type: "github",
        repoId: proj.link?.repoId,
        ref: latestBranch,
      },
    }),
  });
  const deployData = (await deployRes.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (deployData.error) {
    console.error("✗ redeploy failed:", deployData.error.message);
    console.log("  Just open vercel.com dashboard and click Redeploy manually.");
  } else {
    console.log(`✓ deployment started: https://${deployData.url}`);
  }

  console.log("\n🎉 Automation done. Manual steps still needed:");
  console.log("  1. Slack app → Manage Distribution → Activate Public Distribution");
  console.log("  2. Slack app → Install App → copy new xoxb- token");
  console.log("  3. Share the new xoxb- token in chat so I can update the DB");
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
