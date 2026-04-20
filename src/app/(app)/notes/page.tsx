import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { NotesPanel } from "@/components/notes-panel";
import { getLocale } from "@/lib/i18n";

export default async function NotesPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {locale === "id" ? "Catatan" : "Notes"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {locale === "id"
            ? "Catatan pribadi Anda. Sigap AI bisa baca dan cari di sini saat Anda tanya."
            : "Your private notes. Sigap AI can recall these when you ask."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "id" ? "Semua Catatan" : "All Notes"}</CardTitle>
        </CardHeader>
        <CardContent>
          <NotesPanel locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
