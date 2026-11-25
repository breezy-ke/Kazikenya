"use client";

import { supabase } from "./supabase";
import { compressImage, randomId } from "./utils";

export async function uploadFile(
  bucket: "avatars" | "portfolio" | "job-photos" | "verifications",
  userId: string,
  file: File,
): Promise<{ path: string; url: string | null }> {
  const isPdf = file.type === "application/pdf";
  const blob = isPdf ? file : await compressImage(file, bucket === "avatars" ? 512 : bucket === "verifications" ? 1600 : 1280);
  const ext = isPdf ? "pdf" : blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${randomId()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: isPdf ? "application/pdf" : blob.type || file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  const url = bucket === "verifications" ? null : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return { path, url };
}
