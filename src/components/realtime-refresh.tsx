"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

/**
 * Subscribes to audit_log inserts where current user is the target,
 * and to org_members updates in the same org. Triggers a router.refresh()
 * so server components re-fetch their data.
 *
 * Placed on the /team page so managers see live updates when members
 * change their privacy toggle or when new audit entries are logged.
 */
export function RealtimeRefresh({ userId, orgId }: { userId: string; orgId?: string }) {
  const router = useRouter();

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const sb = createClient(url, key);

    const channel = sb
      .channel(`cowork-live-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "org_members", filter: orgId ? `org_id=eq.${orgId}` : undefined },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log", filter: `target_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [userId, orgId, router]);

  return null;
}
