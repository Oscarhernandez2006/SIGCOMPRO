"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

/** Pin personalizado (SVG en línea) para no depender de las imágenes de Leaflet. */
const pinIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="#d97706" stroke="#ffffff" stroke-width="1.5"><path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Z"/><circle cx="12" cy="11" r="2.3" fill="#ffffff" stroke="none"/></svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 33],
});

function Recentrar({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const zoom = map.getZoom() < 14 ? 16 : map.getZoom();
    map.setView([lat, lng], zoom);
  }, [lat, lng, map]);
  return null;
}

/** Permite ubicar la dirección haciendo clic en cualquier punto del mapa. */
function ClicParaUbicar({ onMover }: { onMover?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMover) onMover(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapaLeaflet({
  lat,
  lng,
  onMover,
}: {
  lat: number;
  lng: number;
  /** Si se define, el marcador es arrastrable y se puede ubicar con clic. */
  onMover?: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom
      style={{ height: 260, width: "100%" }}
      className="rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={[lat, lng]}
        icon={pinIcon}
        draggable={Boolean(onMover)}
        interactive={Boolean(onMover)}
        keyboard={false}
        eventHandlers={
          onMover
            ? {
                dragend: (e) => {
                  const p = (e.target as L.Marker).getLatLng();
                  onMover(p.lat, p.lng);
                },
              }
            : undefined
        }
      />
      {onMover && <ClicParaUbicar onMover={onMover} />}
      <Recentrar lat={lat} lng={lng} />
    </MapContainer>
  );
}

