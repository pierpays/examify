export type ProfileMediaKind = "avatar" | "cover" | "logo";

export async function uploadProfileMedia(
  supabase: any,
  userId: string,
  file: File,
  kind: ProfileMediaKind
) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Profile images must be 10 MB or smaller.");
  }

  const extension =
    file.name.split(".").pop()?.toLowerCase() ||
    (file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg");

  const path = `${userId}/${kind}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("profile-media")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from("profile-media")
    .getPublicUrl(path);

  return data.publicUrl;
}
