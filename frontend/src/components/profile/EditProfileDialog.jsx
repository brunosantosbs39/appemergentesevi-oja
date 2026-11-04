import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/common/ImageUpload";
import { CategoryChips } from "@/components/common/CategoryChips";

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);

const ProfileForm = ({ onSaved, onClose }) => {
  const api = useApi();
  const { me, setMe } = useMe();
  const [f, setF] = useState({
    name: me.name || "", headline: me.headline || "", bio: me.bio || "", city: me.city || "",
    categories: me.categories || [], hourly_rate: me.hourly_rate ?? "", avatar: me.avatar || null, cover: me.cover || null,
  });
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success("Localização capturada"); },
      () => toast.error("Não foi possível obter sua localização"),
    );

  const submit = async (e) => {
    e.preventDefault();
    if (uploading || busy) return;
    setBusy(true);
    try {
      const body = { ...f, name: f.name.trim(), hourly_rate: f.hourly_rate === "" ? null : Number(f.hourly_rate), ...(pos || {}) };
      if (f.avatar === me.avatar) delete body.avatar;
      if (f.cover === (me.cover || null)) delete body.cover;
      const { data } = await api.put("/me", body);
      setMe(data);
      toast.success("Perfil atualizado");
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Imagem de capa">
        <ImageUpload allowReplace value={f.cover} onChange={set("cover")} onBusyChange={setUploading} className="h-36 w-full sm:h-40" testid="edit-cover" label="Adicionar imagem de capa" />
        <p className="text-xs text-muted-foreground">Escolha uma imagem horizontal de até 4 MB. Salve as alterações para atualizar sua capa.</p>
      </Field>
      <div className="flex items-center gap-4">
        <ImageUpload value={f.avatar} onChange={set("avatar")} className="h-24 w-24 shrink-0 rounded-none" testid="edit-avatar" label="Foto" />
        <p className="flex-1 text-sm text-muted-foreground">Conta única para contratar e trabalhar. Preencha seus serviços se quiser aparecer nas buscas.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><Input value={f.name} onChange={set("name")} maxLength={80} data-testid="edit-name-input" /></Field>
        <Field label="Bairro / cidade"><Input value={f.city} onChange={set("city")} maxLength={80} data-testid="edit-city-input" /></Field>
      </div>
      {(
        <>
          <Field label="Serviços que você oferece (opcional)"><CategoryChips value={f.categories} onChange={set("categories")} includeAll={false} multiple testid="edit-category" /></Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Título profissional"><Input value={f.headline} onChange={set("headline")} maxLength={120} data-testid="edit-headline-input" /></Field>
            <Field label="Valor/hora (R$)"><Input type="number" min="0" value={f.hourly_rate} onChange={set("hourly_rate")} data-testid="edit-rate-input" /></Field>
          </div>
        </>
      )}
      <Field label="Sobre"><Textarea value={f.bio} onChange={set("bio")} rows={3} maxLength={1000} data-testid="edit-bio-input" /></Field>
      <Button type="button" variant="outline" className="w-full rounded-none" onClick={locate} data-testid="edit-locate-button">
        <Crosshair className="h-4 w-4" /> {pos ? "Localização atualizada" : "Atualizar minha localização no mapa"}
      </Button>
      <Button type="submit" disabled={busy || uploading} className="h-12 w-full rounded-none text-base font-semibold" data-testid="edit-profile-submit-button">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações
      </Button>
    </form>
  );
};

export const EditProfileDialog = ({ open, onOpenChange, onSaved }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-none sm:max-w-xl" data-testid="edit-profile-dialog">
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl font-extrabold">Editar perfil</DialogTitle>
        <DialogDescription>Essas informações aparecem para outros usuários.</DialogDescription>
      </DialogHeader>
      {open && <ProfileForm onSaved={onSaved} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>
);
