import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FixSize, Recenter, TILE_ATTR, TILE_URL, meIcon } from "@/components/map/MapView";

function ClickSetter({ onChange }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export const LocationPicker = ({ value, onChange, testid = "location-picker" }) => {
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return toast.error("Seu navegador não suporta localização");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => {
        toast.error("Não foi possível obter sua localização");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };
  return (
    <div className="space-y-2">
      <div className="relative h-44 overflow-hidden rounded-2xl border border-slate-200" data-testid={`${testid}-map`}>
        <MapContainer center={[value.lat, value.lng]} zoom={14} className="z-0 h-full w-full">
          <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
          <ClickSetter onChange={onChange} />
          <Recenter center={value} />
          <FixSize />
          <Marker position={[value.lat, value.lng]} icon={meIcon} />
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>Toque no mapa para ajustar o local</span>
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={locate} data-testid={`${testid}-locate-button`}>
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          Usar minha localização
        </Button>
      </div>
    </div>
  );
};
