import Image from "next/image";

export function CameraPhoto({
  name,
  photo,
  priority = false,
}: {
  name: string;
  photo?: { alt: string; url: string };
  priority?: boolean;
}) {
  if (!photo) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-stone-200 px-6 text-center text-sm font-medium text-stone-600">
        No photo available for {name}
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-stone-200">
      <Image
        alt={photo.alt}
        className="object-cover"
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 50vw"
        src={photo.url}
      />
    </div>
  );
}
