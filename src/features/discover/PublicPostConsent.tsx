import { useEffect, useState } from "react";

export function PublicPostConsent({
  files,
  accepted,
  onChange,
}: {
  files: File[];
  accepted: boolean;
  onChange: (value: boolean) => void;
}) {
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    const next = files
      .filter((file) =>
        ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
          file.type,
        ),
      )
      .map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [files]);
  return (
    <div className="mt-4 space-y-3">
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {previews.map((item) => (
            <figure key={item.url}>
              <img
                src={item.url}
                alt={`Preview: ${item.name}`}
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              <figcaption className="break-words text-xs text-slate-600">
                {item.name}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={accepted}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          I have permission to publish this text and these photos. I have
          removed customer names, addresses, documents, and other private
          information.
        </span>
      </label>
    </div>
  );
}
