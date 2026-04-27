import { supabaseAdmin } from "@/lib/supabase/admin";

export type AgentConfig = {
  user_id: string;
  agent_name: string;
  config: Record<string, unknown>;
  onboarding_completed: boolean;
  onboarding_step: number;
  updated_at: string;
};

/**
 * Read this user's per-agent config. Creates an empty row if missing so
 * later `setConfigKey` calls can update without race.
 */
export async function getAgentConfig(
  userId: string,
  agentName: string,
): Promise<AgentConfig> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("agent_user_config")
    .select("user_id, agent_name, config, onboarding_completed, onboarding_step, updated_at")
    .eq("user_id", userId)
    .eq("agent_name", agentName)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as AgentConfig;

  const seed: AgentConfig = {
    user_id: userId,
    agent_name: agentName,
    config: {},
    onboarding_completed: false,
    onboarding_step: 0,
    updated_at: new Date().toISOString(),
  };
  await sb.from("agent_user_config").insert(seed);
  return seed;
}

/**
 * Merge a single key into the config jsonb (preserves all other keys).
 * Optionally advance onboarding_step.
 */
export async function setConfigKey(
  userId: string,
  agentName: string,
  key: string,
  value: unknown,
  opts: { advanceOnboardingStep?: boolean } = {},
): Promise<AgentConfig> {
  const current = await getAgentConfig(userId, agentName);
  const newConfig = { ...current.config, [key]: value };
  const newStep = opts.advanceOnboardingStep
    ? current.onboarding_step + 1
    : current.onboarding_step;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("agent_user_config")
    .update({
      config: newConfig,
      onboarding_step: newStep,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("agent_name", agentName)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AgentConfig;
}

export async function completeOnboarding(
  userId: string,
  agentName: string,
): Promise<AgentConfig> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("agent_user_config")
    .update({
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("agent_name", agentName)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as AgentConfig;
}
