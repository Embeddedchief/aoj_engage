import { prisma } from "@/lib/db";

// Public on purpose: email clients (Gmail, Outlook…) fetch flyers from here without signing in.
// Each upload gets a new random id and is never edited in place, so it can be cached for a long time.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response("Not found", { status: 404 });
  const m = await prisma.mediaAsset.findUnique({ where: { id }, select: { data: true, mime: true } });
  if (!m?.data || !m.mime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
