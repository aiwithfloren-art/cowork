import { getOctokitForUser, getGithubLogin } from "./client";

/**
 * Tight set of GitHub operations the Coder + Reviewer agents actually need.
 * Intentionally narrower than Composio's 30+ actions — less surface to
 * misuse, simpler descriptions for the LLM to pick correctly.
 */

export async function listRepos(
  userId: string,
  opts: { include_private?: boolean; limit?: number } = {},
): Promise<
  Array<{
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
    updated_at: string;
  }>
> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    visibility: opts.include_private ? "all" : "public",
    sort: "updated",
    per_page: Math.min(opts.limit ?? 30, 100),
  });
  return data.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    private: Boolean(r.private),
    default_branch: r.default_branch ?? "main",
    html_url: r.html_url,
    updated_at: r.updated_at ?? "",
  }));
}

export async function createRepo(
  userId: string,
  opts: {
    name: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
    gitignore_template?: string;
  },
): Promise<{ full_name: string; html_url: string; default_branch: string }> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name: opts.name,
    description: opts.description,
    private: opts.private ?? true,
    auto_init: opts.auto_init ?? true,
    gitignore_template: opts.gitignore_template,
  });
  return {
    full_name: data.full_name,
    html_url: data.html_url,
    default_branch: data.default_branch ?? "main",
  };
}

export async function readFile(
  userId: string,
  opts: { owner: string; repo: string; path: string; ref?: string },
): Promise<{ content: string; sha: string; path: string; size: number }> {
  const octokit = await getOctokitForUser(userId);
  const res = await octokit.repos.getContent({
    owner: opts.owner,
    repo: opts.repo,
    path: opts.path,
    ref: opts.ref,
  });
  const data = res.data;
  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`${opts.path} is not a file`);
  }
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return {
    content,
    sha: data.sha,
    path: data.path,
    size: data.size,
  };
}

export async function writeFile(
  userId: string,
  opts: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
  },
): Promise<{ commit_sha: string; html_url: string }> {
  const octokit = await getOctokitForUser(userId);

  // createOrUpdateFileContents needs the current sha when updating. Try to
  // fetch it; if 404 we're creating a new file.
  let sha: string | undefined;
  try {
    const res = await octokit.repos.getContent({
      owner: opts.owner,
      repo: opts.repo,
      path: opts.path,
      ref: opts.branch,
    });
    if (!Array.isArray(res.data) && res.data.type === "file") {
      sha = res.data.sha;
    }
  } catch {
    // file doesn't exist yet — sha stays undefined (create)
  }

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: opts.owner,
    repo: opts.repo,
    path: opts.path,
    message: opts.message,
    content: Buffer.from(opts.content, "utf-8").toString("base64"),
    branch: opts.branch,
    sha,
  });
  return {
    commit_sha: data.commit.sha ?? "",
    html_url: data.content?.html_url ?? "",
  };
}

export async function writeFilesBatch(
  userId: string,
  opts: {
    owner: string;
    repo: string;
    files: Array<{ path: string; content: string }>;
    message: string;
    branch?: string;
  },
): Promise<{
  commit_sha: string;
  html_url: string;
  files_count: number;
  branch: string;
}> {
  if (!opts.files.length) {
    throw new Error("writeFilesBatch: files array is empty");
  }

  const octokit = await getOctokitForUser(userId);

  let branch = opts.branch;
  if (!branch) {
    const { data: repoData } = await octokit.repos.get({
      owner: opts.owner,
      repo: opts.repo,
    });
    branch = repoData.default_branch;
  }

  const { data: refData } = await octokit.git.getRef({
    owner: opts.owner,
    repo: opts.repo,
    ref: `heads/${branch}`,
  });
  const parentSha = refData.object.sha;

  const { data: parentCommit } = await octokit.git.getCommit({
    owner: opts.owner,
    repo: opts.repo,
    commit_sha: parentSha,
  });
  const parentTreeSha = parentCommit.tree.sha;

  const { data: newTree } = await octokit.git.createTree({
    owner: opts.owner,
    repo: opts.repo,
    base_tree: parentTreeSha,
    tree: opts.files.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content,
    })),
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: opts.owner,
    repo: opts.repo,
    message: opts.message,
    tree: newTree.sha,
    parents: [parentSha],
  });

  await octokit.git.updateRef({
    owner: opts.owner,
    repo: opts.repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  return {
    commit_sha: newCommit.sha,
    html_url: newCommit.html_url,
    files_count: opts.files.length,
    branch,
  };
}

export async function listCommits(
  userId: string,
  opts: {
    owner: string;
    repo: string;
    since?: string; // ISO
    branch?: string;
    author?: string;
    limit?: number;
  },
): Promise<
  Array<{
    sha: string;
    message: string;
    author_login: string | null;
    author_date: string;
    html_url: string;
  }>
> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.repos.listCommits({
    owner: opts.owner,
    repo: opts.repo,
    since: opts.since,
    sha: opts.branch,
    author: opts.author,
    per_page: Math.min(opts.limit ?? 20, 100),
  });
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author_login: c.author?.login ?? null,
    author_date: c.commit.author?.date ?? "",
    html_url: c.html_url,
  }));
}

export async function getCommitDiff(
  userId: string,
  opts: { owner: string; repo: string; sha: string },
): Promise<{ sha: string; files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>; stats: { total: number; additions: number; deletions: number } }> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.repos.getCommit({
    owner: opts.owner,
    repo: opts.repo,
    ref: opts.sha,
  });
  return {
    sha: data.sha,
    stats: {
      total: data.stats?.total ?? 0,
      additions: data.stats?.additions ?? 0,
      deletions: data.stats?.deletions ?? 0,
    },
    files: (data.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch?.slice(0, 4000), // cap so a huge diff doesn't blow the LLM context
    })),
  };
}

export async function createPullRequest(
  userId: string,
  opts: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string; // branch
    base: string; // usually main
  },
): Promise<{ number: number; html_url: string }> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.pulls.create({
    owner: opts.owner,
    repo: opts.repo,
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: opts.base,
  });
  return { number: data.number, html_url: data.html_url };
}

export async function listOpenPRs(
  userId: string,
  opts: { owner: string; repo: string; limit?: number },
): Promise<
  Array<{
    number: number;
    title: string;
    html_url: string;
    author_login: string | null;
    updated_at: string;
    head_ref: string;
    base_ref: string;
  }>
> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.pulls.list({
    owner: opts.owner,
    repo: opts.repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: Math.min(opts.limit ?? 20, 100),
  });
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    html_url: p.html_url,
    author_login: p.user?.login ?? null,
    updated_at: p.updated_at,
    head_ref: p.head.ref,
    base_ref: p.base.ref,
  }));
}

export async function commentOnPR(
  userId: string,
  opts: { owner: string; repo: string; pr_number: number; body: string },
): Promise<{ html_url: string }> {
  const octokit = await getOctokitForUser(userId);
  const { data } = await octokit.issues.createComment({
    owner: opts.owner,
    repo: opts.repo,
    issue_number: opts.pr_number,
    body: opts.body,
  });
  return { html_url: data.html_url };
}

export { getGithubLogin };
