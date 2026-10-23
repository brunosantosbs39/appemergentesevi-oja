import { useEffect, useState } from "react";
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

export const CreatePostDialog = ({ open, onOpenChange, onCreated, kind = "publication" }) => {
  const api = useApi();
  const { me } = useMe();
  const [image, setImage] = useState(null);
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState(me.categories?.[0] || "outros");
  const [locName, setLocName] = useState(me.city || "");
  const [coords, setCoords] = useState(me.lat != null ? { lat: me.lat, lng: me.lng } : null);
  const [busy, setBusy] = useState(false);
  const [expiry, setExpiry] = useState(() => { const date = new Date(Date.now() + 86400000); return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [requestId, setRequestId] = useState("");
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (open && kind === "publication" && me.role === "contratante") api.get("/requests/mine").then(({ data }) => setRequests(data.filter((r) => r.client_id === me.user_id && ["pendente", "aceito"].includes(r.status)))).catch(() => {});
  }, [api, open, kind, me.role, me.user_id]);

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
      const { data } = await api.post("/posts", { kind, expires_at: kind === "publication" && expiry ? new Date(expiry).toISOString() : null, request_id: kind === "publication" ? requestId || null : null, image, caption, category, location_name: locName || null, ...(coords || {}) });
      onCreated(data);
      toast.success(kind === "portfolio" ? "Trabalho adicionado ao portfólio!" : "Postagem publicada!");
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
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-none sm:max-w-2xl" data-testid="create-post-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-extrabold">{kind === "portfolio" ? "Adicionar trabalho ao portfólio" : "Nova publicação"}</DialogTitle>
          <DialogDescription>{kind === "portfolio" ? "Apresente trabalhos realizados. Eles ficam disponíveis permanentemente no seu perfil." : "Defina a validade. Publicações vinculadas a vagas saem da divulgação no check-in ou no prazo definido."}</DialogDescription>
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
              {coords && <p className="text-xs text-foreground">Postagem aparecerá no mapa</p>}
            </div>
          </div>
        </div>
        {kind === "publication" && <div className="space-y-3">
          <label className="block space-y-1.5"><span>Publicação válida até</span><Input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} /><span className="text-xs text-muted-foreground">Horário local do seu aparelho. A publicação sai do feed quando vencer.</span></label>
          {me.role === "contratante" && <label className="block space-y-1.5"><span>Vincular a uma vaga</span><select value={requestId} onChange={(e) => setRequestId(e.target.value)} className="w-full border border-border bg-background p-2 text-sm"><option value="">Sem vínculo</option>{requests.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>}
        </div>}
        <Button onClick={submit} disabled={busy || !image || kind === "publication" && !expiry} className="h-12 w-full rounded-none text-base font-semibold" data-testid="create-post-submit-button">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
        </Button>
      </DialogContent>
    </Dialog>
  );
};
