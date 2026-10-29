import { groupRequests, requestPrice } from "@/components/map/requestMarkers.mjs";
import "@/components/map/requestMarkers.css";
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

const reqIcon = (group) => {
  const label = group.items.length > 1 ? `${group.items.length} vagas` : requestPrice(group.items[0]);
  return L.divIcon({
    className: "vacancy-marker",
    html: `<div class="vacancy-pin" data-testid="map-marker-request-${esc(group.items[0].id)}"><div class="vacancy-price">${esc(label)}</div><div class="vacancy-stem"></div><div class="vacancy-dot"><span></span></div></div>`,
    iconSize: [128, 68],
    iconAnchor: [64, 66],
    popupAnchor: [0, -65],
  });
};

export const meIcon = L.divIcon({ className: "", html: '<div class="pin-me" data-testid="map-marker-me"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

export function Recenter({ center, locationVersion = 0, accuracyMeters }) {
  const map = useMap();
  useEffect(() => {
    if (locationVersion > 0 && accuracyMeters != null) {
      const bounds = L.latLng(center.lat, center.lng).toBounds(Math.max(accuracyMeters * 2, 200));
      map.fitBounds(bounds, {padding:[35,35],maxZoom:17,animate:true});
    } else {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
    }
  }, [center.lat, center.lng, locationVersion, accuracyMeters, map]);
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

export const MapView = ({ center, radiusKm = 0, accuracyMeters = null, locationVersion = 0, showMe = true, pros = [], requests = [], renderProPopup, renderRequestPopup, className, zoom = 12 }) => (
  <div data-testid="leaflet-map-container" className={cn("relative overflow-hidden rounded-none border border-border shadow-sm", className)}>
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom className="z-0 h-full w-full">
      <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
      <Recenter center={center} locationVersion={locationVersion} accuracyMeters={accuracyMeters} />
      <FixSize />
      {radiusKm > 0 && (
        <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#059669", weight: 1.5, fillOpacity: 0.05 }} />
      )}
      {showMe && <Marker position={[center.lat, center.lng]} icon={meIcon} />}
      {accuracyMeters != null && <Circle center={[center.lat, center.lng]} radius={accuracyMeters} pathOptions={{color:"#3b82f6",fillOpacity:0.12,weight:1}} />}
      {pros
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180)
        .map((p) => (
          <Marker key={p.user_id} position={[p.lat, p.lng]} icon={proIcon(p)}>
            {renderProPopup && <Popup>{renderProPopup(p)}</Popup>}
          </Marker>
        ))}
      {groupRequests(requests).map((group) => (
        <Marker key={group.key} position={[group.lat, group.lng]} icon={reqIcon(group)}
          zIndexOffset={500} title={group.items.length > 1 ? `${group.items.length} vagas neste local` : `${group.items[0].title}: ${requestPrice(group.items[0])}`}>
          {renderRequestPopup && <Popup maxWidth={300}><div className="vacancy-popup-list">
            {group.items.map(r=><div key={r.id}>{renderRequestPopup(r)}</div>)}
          </div></Popup>}
        </Marker>
      ))}
    </MapContainer>
  </div>
);
