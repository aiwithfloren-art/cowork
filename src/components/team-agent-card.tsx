"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AssignAgentModal } from "./assign-agent-modal";
import type { OrgMember } from "./skill-card";

/**
 * Card for a published org template, shown in the admin "Team Agents"
 * section of /agents. Surfaces the assignment count, opens the assign
 * modal, and links to the source agent for editing (since the published
 * template is just a snapshot — admins edit the personal source).
 */
export function TeamAgentCard({
  templateId,
  name,
  emoji,
  description,
  toolsCount,
  assignedCount,
  assignedUserIds,
  members,
  sourceSlug,
}: {
  templateId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  toolsCount: number;
  assignedCount: number;
  assignedUserIds: string[];
  members: OrgMember[];
  sourceSlug: string | null;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{emoji ?? "🤖"}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{name}</p>
          {description && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{toolsCount} tools</span>
            <span>·</span>
            <span>
              👥 {assignedCount}{" "}
              {assignedCount === 1 ? "assigned" : "assigned"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sourceSlug && (
          <Link
            href={`/agents/${sourceSlug}`}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            Open
          </Link>
        )}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          👥 Assign{assignedCount > 0 ? ` (${assignedCount})` : ""}
        </button>
      </div>

      {showModal && (
        <AssignAgentModal
          templateId={templateId}
          templateName={name}
          templateEmoji={emoji}
          members={members}
          alreadyAssignedUserIds={assignedUserIds}
          onClose={() => setShowModal(false)}
          onAssigned={() => {
            setShowModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
