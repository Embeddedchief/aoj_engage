import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notificationWhere } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { markAllRead } from "@/actions/admin";

export const metadata = { title: "Notifications" };

const DOT = { info: "bg-sky-500", warning: "bg-warn", error: "bg-bad", success: "bg-ok" } as Record<string, string>;

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: notificationWhere(user), orderBy: { createdAt: "desc" }, take: 150 });
  const unread = items.filter((n) => !n.readBy.includes(user.id)).length;
  return (
    <>
      <PageHeader title="Notifications" description="Upcoming occasions, approvals, delivery results, bounces and system alerts." actions={unread > 0 && <ActionButton action={markAllRead}>Mark all as read ({unread})</ActionButton>} />
      <div className="card">
        {items.length === 0 ? <Empty icon={Bell} title="No notifications yet" /> : (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const isUnread = !n.readBy.includes(user.id);
              const body = (
                <div className={cn("flex gap-3 px-5 py-3.5", isUnread && "bg-brand-50/30")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[n.level] ?? DOT.info)} aria-label={n.level} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", isUnread ? "font-semibold text-navy" : "text-ink")}>{n.title}</div>
                    {n.body && <div className="text-sm text-muted">{n.body}</div>}
                  </div>
                  <div className="whitespace-nowrap text-xs text-muted">{fmtDateTime(n.createdAt)}</div>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-canvas/60">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </div>
    </>
  );
}
