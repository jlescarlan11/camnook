"use client";
import { useEffect, useRef, useState } from "react";

export function PlaceMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
    if (!key || !node.current) return;
    let cancelled = false;
    let clean = () => {};
    void import("leaflet")
      .then((L) => {
        if (cancelled || !node.current) return;
        const map = L.map(node.current, { scrollWheelZoom: false }).setView(
          [latitude, longitude],
          16,
        );
        const tiles = L.tileLayer(
          `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(key)}`,
          {
            maxZoom: 20,
            attribution: "© OpenStreetMap contributors · Powered by Geoapify",
          },
        ).addTo(map);
        tiles.on("tileerror", () => setFailed(true));
        const pin = L.marker([latitude, longitude], {
          draggable: true,
          icon: L.divIcon({
            className: "camnook-map-pin",
            html: '<span aria-hidden="true">●</span>',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
          }),
        }).addTo(map);
        map.on("click", (e) => callback.current(e.latlng.lat, e.latlng.lng));
        pin.on("dragend", () => {
          const p = pin.getLatLng();
          callback.current(p.lat, p.lng);
        });
        clean = () => map.remove();
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      clean();
    };
  }, [latitude, longitude]);
  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-600">
        Click the public entrance or drag the pin. Confirm the position below.
      </p>
      {process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY ? (
        <div
          ref={node}
          className="h-72 rounded-lg"
          aria-label="Public meetup place map"
        />
      ) : null}
      {failed || !process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY ? (
        <p role="status">
          Map unavailable. Enter coordinates and use View on map to verify them.
        </p>
      ) : null}
    </div>
  );
}
