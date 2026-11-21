"use client";
// Taking a photo on the phone and sending it to Klara (POST /api/photos).
// Phone photos are 3–8 MB; they are shrunk to ~1600 px JPEG first (quick on
// site networks, and under the hosting upload limit).
import type { Turn } from "@/lib/types";
import { ApiError } from "@/lib/use-api";

const MAX_EDGE = 1600;

export type PhotoUpload = {
  url: string;
  case: { id: string; reference: string; doc_type: string };
  klara_turn: Turn | null;
};

async function shrink(file: File): Promise<{ blob: Blob; width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const width = Math.round(bmp.width * scale);
    const height = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (blob) return { blob, width, height };
  } catch {
    // The browser cannot decode it (e.g. HEIC outside Safari): send the original; the server checks size and type.
  }
  return { blob: file, width: null, height: null };
}

export async function uploadPhoto(opts: { file: File; teamId: string; conversationId?: string | null }): Promise<PhotoUpload> {
  const { blob, width, height } = await shrink(opts.file);
  const form = new FormData();
  form.append("photo", blob, blob.type === "image/jpeg" ? "foto.jpg" : opts.file.name || "foto");
  form.append("team_id", opts.teamId);
  if (opts.conversationId) form.append("conversation_id", opts.conversationId);
  if (width) form.append("width", String(width));
  if (height) form.append("height", String(height));
  const r = await fetch("/api/photos", { method: "POST", body: form });
  const out = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(out?.error ?? `Fehler ${r.status}`, r.status);
  return out as PhotoUpload;
}
