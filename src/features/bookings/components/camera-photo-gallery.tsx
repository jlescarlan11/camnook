"use client";

import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from "@radix-ui/react-icons";
import { useRef, useState } from "react";
import { CameraPhoto } from "./camera-photo";

export function CameraPhotoGallery({ name, photos }: {
  name: string;
  photos: { alt: string; url: string }[];
}) {
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  if (!photos.length) return <CameraPhoto name={name} />;
  function zoom(index: number) { setSelected(index); dialog.current?.showModal(); }
  function move(offset: number) { setSelected((index) => (index + offset + photos.length) % photos.length); }

  return <section className="camera-gallery" aria-label={`${name} photos`}>
    <button className="camera-gallery-main" type="button" aria-label={`Enlarge photo ${selected + 1} of ${name}`} onClick={() => zoom(selected)}>
      <CameraPhoto name={name} photo={photos[selected]} fit="cover" priority />
    </button>
    <ol className="camera-thumbnails">
      {photos.map((photo, index) => <li key={photo.url}>
        <button type="button" aria-label={`Enlarge photo ${index + 1}: ${photo.alt}`} data-selected={selected === index ? "true" : undefined} onClick={() => zoom(index)}>
          <CameraPhoto name={name} photo={photo} fit="contain" />
        </button>
      </li>)}
    </ol>
    <dialog ref={dialog} className="camera-lightbox" aria-label={`${name} enlarged photos`} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); } if (event.key === "ArrowRight") { event.preventDefault(); move(1); } }}>
      <div className="camera-lightbox-content">
        <button className="dialog-close" type="button" aria-label="Close enlarged photo" onClick={() => dialog.current?.close()}><Cross2Icon width={22} height={22} /></button>
        <CameraPhoto name={name} photo={photos[selected]} fit="contain" />
        <div className="camera-lightbox-controls">
          <button className="button-secondary" type="button" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => move(-1)}><ChevronLeftIcon /></button>
          <p aria-live="polite">Photo {selected + 1} of {photos.length}</p>
          <button className="button-secondary" type="button" aria-label="Next photo" disabled={photos.length < 2} onClick={() => move(1)}><ChevronRightIcon /></button>
        </div>
      </div>
    </dialog>
  </section>;
}
