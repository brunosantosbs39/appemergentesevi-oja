import { useEffect } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { imgUrl } from "@/lib/api";
import { initials } from "@/components/common/UserAvatar";
import { cn } from "@/lib/utils";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const proIcon = (p) =>
  L.divIcon({
    className: "",
    html: `<div class="pin-pro" data-testid="map-marker-pro-${esc(p.user_id)}">${
      p.avatar ? `<img src="${esc(imgUrl(p.avatar))}" alt=""/>` : `<span>${esc(initials(p.name))}</span>`
    }</div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -22],
  });

const reqIcon = (r) =>
  L.divIcon({
    className: "",
    html: `<div class="pin-req" data-testid="map-marker-request-${esc(r.id)}"><span>R$</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

export const meIcon = L.divIcon({ className: "", html: '<div class="pin-me" data-testid="map-marker-me"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

export function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, map]);
  return null;
}

export function FixSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export const MapView = ({ center, radiusKm = 0, pros = [], requests = [], renderProPopup, renderRequestPopup, className, zoom = 12 }) => (
  <div data-testid="leaflet-map-container" className={cn("relative overflow-hidden rounded-3xl border border-slate-200 shadow-sm", className)}>
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom className="z-0 h-full w-full">
      <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
      <Recenter center={center} />
      <FixSize />
      {radiusKm > 0 && (
        <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#059669", weight: 1.5, fillOpacity: 0.05 }} />
      )}
      <Marker position={[center.lat, center.lng]} icon={meIcon} />
      {pros
        .filter((p) => p.lat != null)
        .map((p) => (
          <Marker key={p.user_id} position={[p.lat, p.lng]} icon={proIcon(p)}>
            {renderProPopup && <Popup>{renderProPopup(p)}</Popup>}
          </Marker>
        ))}
      {requests
        .filter((r) => r.lat != null)
        .map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={reqIcon(r)}>
            {renderRequestPopup && <Popup>{renderRequestPopup(r)}</Popup>}
          </Marker>
        ))}
    </MapContainer>
  </div>
);
