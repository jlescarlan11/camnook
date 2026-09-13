import Image from "next/image";

export function CameraPhoto({
  name,
  photo,
  priority = false,
  fit = "cover",
  spotlight = false,
}: {
  name: string;
  photo?: { alt: string; url: string };
  priority?: boolean;
  fit?: "cover" | "contain";
  spotlight?: boolean;
}) {
  if (!photo) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-stone-200 px-6 text-center text-sm font-medium text-stone-600">
        No photo available for {name}
      </div>
    );
  }

  return (
    <div className={spotlight ? "spotlight-photo-frame" : "relative aspect-[4/3] overflow-hidden bg-white"}>
      <Image
        alt={photo.alt}
        className={spotlight || fit === "cover" ? "object-cover" : "object-contain"}
        fill
        preload={priority}
        sizes={spotlight ? "(max-width: 768px) calc(100vw - 32px), 1000px" : "(max-width: 768px) 100vw, 50vw"}
        src={photo.url}
      />
    </div>
  );
}
