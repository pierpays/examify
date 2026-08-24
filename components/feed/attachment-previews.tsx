"use client";

function youtubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0] ?? "") && parts[1]) {
        return `https://www.youtube.com/embed/${parts[1]}`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function documentLabel(name: string | null, mime: string | null) {
  const extension = name?.split(".").pop()?.toUpperCase();

  if (extension === "PDF" || mime === "application/pdf") return "PDF document";
  if (["DOC", "DOCX"].includes(extension ?? "")) return "Word document";
  if (["PPT", "PPTX"].includes(extension ?? "")) return "PowerPoint";
  if (["XLS", "XLSX", "CSV"].includes(extension ?? "")) return "Spreadsheet";
  if (extension === "TXT") return "Text document";

  return "Shared document";
}

function formatSize(size: number | null) {
  if (!size) return null;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPreviews({
  linkUrl,
  documentUrl,
  documentName,
  documentMimeType,
  documentSize,
}: {
  linkUrl: string | null;
  documentUrl: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  documentSize: number | null;
}) {
  const embedUrl = linkUrl ? youtubeEmbedUrl(linkUrl) : null;

  let hostname = "";
  if (linkUrl) {
    try {
      hostname = new URL(linkUrl).hostname.replace(/^www\./, "");
    } catch {
      hostname = linkUrl;
    }
  }

  return (
    <>
      {linkUrl && embedUrl && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-black">
          <div className="aspect-video w-full">
            <iframe
              src={embedUrl}
              title="YouTube video"
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-red-600">
              YouTube
            </p>
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate text-sm font-semibold text-slate-700 hover:underline"
            >
              {linkUrl}
            </a>
          </div>
        </div>
      )}

      {linkUrl && !embedUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition hover:border-[#2563EB]"
        >
          <div className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">
              External academic link
            </p>
            <p className="mt-2 truncate font-bold text-slate-900">
              {hostname || "Open link"}
            </p>
            <p className="mt-1 truncate text-sm text-slate-500">{linkUrl}</p>
            <p className="mt-3 text-sm font-bold text-[#2563EB]">
              Open link →
            </p>
          </div>
        </a>
      )}

      {documentUrl && (
        <a
          href={documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={documentName ?? undefined}
          className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-[#2563EB]"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-2xl">
            📄
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-900">
              {documentName ?? "Download document"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {[documentLabel(documentName, documentMimeType), formatSize(documentSize)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span className="shrink-0 text-sm font-bold text-[#2563EB]">
            Download
          </span>
        </a>
      )}
    </>
  );
}
