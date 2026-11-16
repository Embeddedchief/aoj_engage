import { ImageIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { addMedia, deleteMedia } from "@/actions/admin";

export const metadata = { title: "Media library" };
const KINDS = ["Logo", "Banner", "Festive", "Project", "Photo", "Staff celebration", "Signature", "Icon"];

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const user = await requireUser();
  const { kind } = await searchParams;
  const assets = await prisma.mediaAsset.findMany({ where: kind ? { kind } : {}, orderBy: { createdAt: "desc" } });
  const canWrite = can(user.role, "media:write");
  return (
    <>
      <PageHeader title="Media library" description="Approved logos, banners, festive graphics and project photos, available from the template editor's image and banner blocks. Images must be publicly hosted over https (e.g. Amazon S3 or the company website) so email clients can load them." />
      {canWrite && (
        <Card title="Add an image" className="mb-6">
          <ActionForm action={addMedia} resetOnSuccess className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <input className="input" name="url" placeholder="https://…/christmas-banner-2026.png" required />
            <input className="input" name="name" placeholder="Name" />
            <select className="input" name="kind">{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <Submit>Add</Submit>
          </ActionForm>
        </Card>
      )}
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/media" className={`rounded-full px-3 py-1 ${!kind ? "bg-navy text-white" : "bg-white ring-1 ring-line"}`}>All</a>
        {KINDS.map((k) => <a key={k} href={`/media?kind=${encodeURIComponent(k)}`} className={`rounded-full px-3 py-1 ${kind === k ? "bg-navy text-white" : "bg-white ring-1 ring-line"}`}>{k}</a>)}
      </form>
      {assets.length === 0 ? <div className="card"><Empty icon={ImageIcon} title="No media yet">Add the official AOJ logo variations, festive banners and project photos.</Empty></div> : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {assets.map((a) => (
            <figure key={a.id} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name} className="aspect-video w-full bg-canvas object-contain" loading="lazy" referrerPolicy="no-referrer" />
              <figcaption className="flex items-center justify-between gap-2 p-3 text-xs">
                <span className="min-w-0"><span className="block truncate font-medium text-navy">{a.name}</span><span className="text-muted">{a.kind}</span></span>
                {canWrite && <ActionButton action={deleteMedia} fields={{ id: a.id }} className="btn-ghost px-1.5 py-0.5 text-xs" confirm="Remove from library?">Remove</ActionButton>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
