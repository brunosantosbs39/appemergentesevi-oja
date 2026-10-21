import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUpload } from "@/components/common/ImageUpload";

export const CreatePostDialog = ({ open, onOpenChange, onCreated }) => {
  const api = useApi();
  const { me } = useMe();
  const [image, setImage] = useState(null);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState(me.categories?.[0] || "outros");
  const [locName, setLocName] = useState(me.city || "");
  const [coords, setCoords] = useState(me.lat != null ? { lat: me.lat, lng: me.lng } : null);
  const [busy, setBusy] = useState(false);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        toast.success("Localização adicionada");
      },
      () => toast.error("Não foi possível obter sua localização"),
    );

  const submit = async () => {
    if (!image) return toast.error("Adicione uma foto");
    setBusy(true);
    try {
      const { data } = await api.post("/posts", { image, caption, category, location_name: locName || null, ...(coords || {}) });
      onCreated(data);
      toast.success("Postagem publicada!");
      setImage(null);
      setCaption("");
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl" data-testid="create-post-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-extrabold">Nova postagem</DialogTitle>
          <DialogDescription>Mostre seu trabalho para quem está por perto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageUpload value={image} onChange={setImage} className="aspect-square" testid="create-post-image" label="Escolher foto" />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Legenda</Label>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2200} placeholder="Conte sobre o serviço..." data-testid="create-post-caption-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="create-post-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Local</Label>
              <div className="flex gap-2">
                <Input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Ex.: Pinheiros, SP" maxLength={120} data-testid="create-post-location-input" />
                <Button type="button" variant="outline" size="icon" onClick={locate} aria-label="Usar GPS" data-testid="create-post-locate-button">
                  <Crosshair className="h-4 w-4" />
                </Button>
              </div>
              {coords && <p className="text-xs text-emerald-700">Postagem aparecerá no mapa</p>}
            </div>
          </div>
        </div>
        <Button onClick={submit} disabled={busy || !image} className="h-12 w-full rounded-full text-base font-semibold" data-testid="create-post-submit-button">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
        </Button>
      </DialogContent>
    </Dialog>
  );
};
