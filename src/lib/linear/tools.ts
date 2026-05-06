import { tool } from "ai";
import { z } from "zod";
import { getLinearToken, linearGraphQL } from "./client";

export function buildLinearTools(userId: string) {
  return {
    linear_list_issues: tool({
      description:
        "List issues in Linear, optionally filtered by team key (e.g. 'ENG') or status (e.g. 'In Progress', 'Todo', 'Done'). Returns up to 25 issues with id, title, status, assignee, url.",
      inputSchema: z.object({
        team_key: z.string().optional().describe("Team key like 'ENG' or 'SIG'"),
        status: z.string().optional().describe("Status name to filter by"),
        limit: z.number().int().min(1).max(50).default(25).optional(),
      }),
      execute: async ({ team_key, status, limit }) => {
        const token = await getLinearToken(userId);
        if (!token) return { error: "Linear not connected. Connect at /integrations." };
        const filter: Record<string, unknown> = {};
        if (team_key) filter.team = { key: { eq: team_key } };
        if (status) filter.state = { name: { eq: status } };
        const data = await linearGraphQL<{
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              url: string;
              state: { name: string };
              assignee?: { name?: string; email?: string } | null;
              team: { key: string };
            }>;
          };
        }>(
          token,
          `query($filter: IssueFilter, $first: Int) {
            issues(filter: $filter, first: $first) {
              nodes { id identifier title url state { name } assignee { name email } team { key } }
            }
          }`,
          { filter, first: limit ?? 25 },
        );
        return {
          issues: data.issues.nodes.map((i) => ({
            id: i.identifier,
            title: i.title,
            status: i.state.name,
            assignee: i.assignee?.name ?? null,
            team: i.team.key,
            url: i.url,
          })),
        };
      },
    }),

    linear_create_issue: tool({
      description:
        "Create a new Linear issue. Provide title, description, and either team_id or team_key. Optional: assignee email, priority (0-4, 0=none, 1=urgent, 2=high, 3=medium, 4=low).",
      inputSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        team_key: z.string().describe("Team key like 'ENG'"),
        assignee_email: z.string().email().optional(),
        priority: z.number().int().min(0).max(4).optional(),
      }),
      execute: async ({ title, description, team_key, assignee_email, priority }) => {
        const token = await getLinearToken(userId);
        if (!token) return { error: "Linear not connected. Connect at /integrations." };

        const teamData = await linearGraphQL<{
          teams: { nodes: Array<{ id: string; key: string }> };
        }>(token, `query { teams { nodes { id key } } }`);
        const team = teamData.teams.nodes.find((t) => t.key === team_key);
        if (!team) return { error: `Team '${team_key}' not found` };

        let assigneeId: string | undefined;
        if (assignee_email) {
          const u = await linearGraphQL<{
            users: { nodes: Array<{ id: string; email: string }> };
          }>(
            token,
            `query($email: String!) { users(filter: { email: { eq: $email } }) { nodes { id email } } }`,
            { email: assignee_email },
          );
          assigneeId = u.users.nodes[0]?.id;
        }

        const result = await linearGraphQL<{
          issueCreate: { success: boolean; issue: { identifier: string; url: string } };
        }>(
          token,
          `mutation($input: IssueCreateInput!) {
            issueCreate(input: $input) { success issue { identifier url } }
          }`,
          {
            input: {
              title,
              description,
              teamId: team.id,
              assigneeId,
              priority,
            },
          },
        );
        if (!result.issueCreate.success) return { error: "Failed to create issue" };
        return {
          ok: true,
          id: result.issueCreate.issue.identifier,
          url: result.issueCreate.issue.url,
        };
      },
    }),

    linear_update_issue: tool({
      description:
        "Update a Linear issue's title, description, status, or assignee. Provide the issue identifier (e.g. 'ENG-123').",
      inputSchema: z.object({
        issue_id: z.string().describe("Issue identifier like 'ENG-123'"),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.string().optional().describe("Status name like 'In Progress'"),
        assignee_email: z.string().email().optional(),
      }),
      execute: async ({ issue_id, title, description, status, assignee_email }) => {
        const token = await getLinearToken(userId);
        if (!token) return { error: "Linear not connected. Connect at /integrations." };

        const found = await linearGraphQL<{
          issues: { nodes: Array<{ id: string; team: { id: string } }> };
        }>(
          token,
          `query($id: String!) { issues(filter: { number: { eq: 0 } }, first: 0) { nodes { id team { id } } }
           q1: issues(filter: { team: { key: { eq: "${issue_id.split("-")[0]}" } }, number: { eq: ${parseInt(issue_id.split("-")[1] ?? "0", 10)} } }, first: 1) { nodes { id team { id } } } }`,
          { id: issue_id },
        );
        const issue = (
          found as unknown as { q1: { nodes: Array<{ id: string }> } }
        ).q1.nodes[0];
        if (!issue) return { error: `Issue ${issue_id} not found` };

        const input: Record<string, unknown> = {};
        if (title) input.title = title;
        if (description) input.description = description;
        if (status) {
          const states = await linearGraphQL<{
            workflowStates: { nodes: Array<{ id: string; name: string }> };
          }>(
            token,
            `query { workflowStates(filter: { name: { eq: "${status}" } }) { nodes { id name } } }`,
          );
          if (states.workflowStates.nodes[0]) {
            input.stateId = states.workflowStates.nodes[0].id;
          }
        }
        if (assignee_email) {
          const u = await linearGraphQL<{
            users: { nodes: Array<{ id: string }> };
          }>(
            token,
            `query($email: String!) { users(filter: { email: { eq: $email } }) { nodes { id } } }`,
            { email: assignee_email },
          );
          if (u.users.nodes[0]) input.assigneeId = u.users.nodes[0].id;
        }

        const result = await linearGraphQL<{
          issueUpdate: { success: boolean };
        }>(
          token,
          `mutation($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) { success }
          }`,
          { id: issue.id, input },
        );
        return { ok: result.issueUpdate.success };
      },
    }),

    linear_list_teams: tool({
      description:
        "List all Linear teams the user has access to. Returns team key, name, and ID. Use this to find the right team_key when creating issues.",
      inputSchema: z.object({}),
      execute: async () => {
        const token = await getLinearToken(userId);
        if (!token) return { error: "Linear not connected. Connect at /integrations." };
        const data = await linearGraphQL<{
          teams: { nodes: Array<{ id: string; key: string; name: string }> };
        }>(token, `query { teams { nodes { id key name } } }`);
        return {
          teams: data.teams.nodes.map((t) => ({
            key: t.key,
            name: t.name,
            id: t.id,
          })),
        };
      },
    }),
  };
}
