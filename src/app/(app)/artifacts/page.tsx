import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { ArtifactsFilter } from "@/components/artifacts-filter";

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  post: { label: "Post", emoji: "📱" },
  caption: { label: "Caption", emoji: "✍️" },
  email: { label: "Email", emoji: "✉️" },
  proposal: { label: "Proposal", emoji: "📄" },
  document: { label: "Document", emoji: "📋" },
};

type ArtifactRow = {
  id: string;
  type: string;
  platform: string | null;
  title: string;
  body_markdown: string;
  status: string;
  created_at: string;
};

export default async function ArtifactsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const { type: typeFilter } = await searchParams;

  const sb = supabaseAdmin();
  let query = sb
    .from("artifacts")
    .select("id, type, platform, title, body_markdown, status, created_at")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(100);
  if (typeFilter && TYPE_LABELS[typeFilter]) {
    query = query.eq("type", typeFilter);
  }
  const { data } = await query;
  const artifacts = (data ?? []) as ArtifactRow[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Artifacts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Semua draft yang dibuatin AI — post, email, proposal, caption.
          Minta Sigap:{" "}
          <span className="font-mono text-indigo-700">
            &quot;buatin post IG soal promo Ramadhan&quot;
          </span>{" "}
          atau{" "}
          <span className="font-mono text-indigo-700">
            &quot;draftin email follow up ke Budi&quot;
          </span>
          .
        </p>
      </div>

      <ArtifactsFilter current={typeFilter ?? null} />

      {artifacts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-2xl">📄</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {typeFilter ? "Belum ada draft tipe ini" : "Belum ada artifact"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Coba ngobrol sama Sigap di chat — setiap draft bakal muncul di sini.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artifacts.map((a) => {
            const tl = TYPE_LABELS[a.type] ?? TYPE_LABELS.document;
            const excerpt = a.body_markdown.replace(/\s+/g, " ").slice(0, 140);
            return (
              <Link
                key={a.id}
                href={`/artifacts/${a.id}`}
                className="block"
              >
                <Card className="transition hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xl leading-none">{tl.emoji}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {a.platform ?? tl.label}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {a.title}
                    </p>
                    <p className="line-clamp-3 flex-1 text-xs text-slate-500">
                      {excerpt}
                      {a.body_markdown.length > 140 ? "…" : ""}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      {new Date(a.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
