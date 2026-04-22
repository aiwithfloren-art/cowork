import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ArtifactViewer, type ArtifactRow } from "@/components/artifact-viewer";

export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("artifacts")
    .select(
      "id, type, platform, title, body_markdown, meta, status, created_at, updated_at",
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) notFound();

  const artifact = data as unknown as ArtifactRow;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-12">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/artifacts"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Artifacts
        </Link>
        <p className="text-[11px] text-slate-400">
          {new Date(artifact.created_at).toLocaleString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <ArtifactViewer artifact={artifact} />
    </div>
  );
}
