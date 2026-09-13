import { CameraPhoto } from "./camera-photo";

export function CameraPhotoGallery({ name, photos }: {
  name: string;
  photos: { alt: string; url: string }[];
}) {
  if (!photos.length) return null;

  return <details className="mt-5 rounded-xl border border-[#d8e0ea] p-4">
    <summary className="min-h-11 cursor-pointer content-center font-semibold text-[#0b4f9c]">
      View {photos.length === 1 ? "photo" : `all ${photos.length} photos`}
    </summary>
    <ol className="mt-4 grid gap-5 sm:grid-cols-2" aria-label={`${name} photos`}>
      {photos.map((photo, index) => <li key={photo.url}>
        <CameraPhoto name={name} photo={photo} fit="contain" />
        <p className="mt-2 text-sm text-[#58677d]">Photo {index + 1} of {photos.length}</p>
      </li>)}
    </ol>
  </details>;
}
