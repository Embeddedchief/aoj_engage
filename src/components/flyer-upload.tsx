"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { uploadMedia } from "@/actions/admin";
import { cn } from "@/lib/utils";

const MAX_W = 1200; // twice the 600px email width: sharp on phones and retina screens, still small

/** Shrink large photos/flyers in the browser so emails stay light. GIFs are kept as-is (they may be animated). */
async function prepare(file: File): Promise<{ blob: Blob; name: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, name: file.name, width: 0, height: 0 };
  const { width, height } = bitmap;
  if (file.type === "image/gif" || (width <= MAX_W && file.size <= 700 * 1024)) {
    bitmap.close();
    return { blob: file, name: file.name, width, height };
  }
  const scale = Math.min(1, MAX_W / width);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff"; // flatten transparency onto white, like the email background
  g.fillRect(0, 0, w, h);
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process the image."))), "image/jpeg", 0.86));
  return { blob, name: file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", width: w, height: h };
}

export function FlyerUpload({ onUploaded, label = "Upload flyer", kind = "Flyer", className, disabled }: {
  onUploaded: (url: string, name: string) => void;
  label?: string;
  kind?: string;
  className?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const p = await prepare(file);
      const fd = new FormData();
      fd.set("file", new File([p.blob], p.name, { type: p.blob.type || file.type }));
      fd.set("kind", kind);
      fd.set("width", String(p.width));
      fd.set("height", String(p.height));
      const r = await uploadMedia(null, fd);
      if (!r.ok) throw new Error(r.error ?? "Upload failed.");
      const d = r.data as { url: string; name: string };
      onUploaded(d.url, d.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className={cn(className ?? "btn-secondary")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {busy ? "Uploading…" : label}
      </button>
      {error && <p className="mt-1 text-xs font-medium text-brand">{error}</p>}
    </div>
  );
}

/** Media library: upload, then refresh the grid. */
export function MediaUploader({ kinds }: { kinds: string[] }) {
  const router = useRouter();
  const [kind, setKind] = useState("Flyer");
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k}>{k}</option>)}</select>
      <FlyerUpload label="Upload image" kind={kind} className="btn-primary" onUploaded={(_, name) => { setDone(`“${name}” uploaded.`); router.refresh(); }} />
      {done && <span className="text-sm font-medium text-emerald-700">{done}</span>}
    </div>
  );
}
