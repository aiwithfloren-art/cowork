"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssignAgentModal } from "./assign-agent-modal";

type Member = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

/**
 * One-shot publish-if-needed + assign button for the personal agent
 * detail page. Saves admins from the manual "Publish then Assign"
 * two-step flow — they just pick employees and the backend handles
 * snapshotting the template.
 */
export function QuickAssignButton({
  agentSlug,
  agentName,
  agentEmoji,
  members,
  alreadyAssignedUserIds,
}: {
  agentSlug: string;
  agentName: string;
  agentEmoji: string | null;
  members: Member[];
  alreadyAssignedUserIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        title="Publish + assign in one step"
      >
        👥 Assign to employee
      </button>

      {open && (
        <AssignAgentModal
          agentSlug={agentSlug}
          templateName={agentName}
          templateEmoji={agentEmoji}
          members={members}
          alreadyAssignedUserIds={alreadyAssignedUserIds}
          onClose={() => setOpen(false)}
          onAssigned={(count) => {
            setOpen(false);
            setToast(
              `✅ Assigned to ${count} ${count === 1 ? "employee" : "employees"}.`,
            );
            router.refresh();
            setTimeout(() => setToast(null), 4000);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
