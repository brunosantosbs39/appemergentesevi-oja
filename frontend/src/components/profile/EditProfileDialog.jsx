import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/common/ImageUpload";
import { CategoryChips } from "@/components/common/CategoryChips";

const Field = ({ label, id, group = false, error, children }) => (
  <div className="space-y-1.5">
    <Label id={id ? `${id}-label` : undefined} htmlFor={group ? undefined : id}>{label}</Label>
    {children}
    {error && <p id={`${id}-error`} className="text-sm text-destructive" role="alert">{error}</p>}
  </div>
);

const ProfileForm = forwardRef(function ProfileForm({ onSaved, onClose, onSavedClose }, ref) {
  const api = useApi();
  const { me, setMe } = useMe();
  const [initial] = useState(() => ({
    name: me.name || "", headline: me.headline || "", bio: me.bio || "", city: me.city || "",
    custom_roles: (me.custom_roles || []).join(", "), categories: me.categories || [], hourly_rate: me.hourly_rate ?? "", avatar: me.avatar || null, cover: me.cover || null,
  }));
  const [f, setF] = useState(initial);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState({});
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const form = useRef(null);
  const mounted = useRef(true);
  const uploading = !!(uploads.avatar || uploads.cover);
  const dirty = !!pos || JSON.stringify(f) !== JSON.stringify(initial);
  useImperativeHandle(ref, () => ({ dirty, busy, uploading }));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!dirty && !uploading && !busy) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading, busy]);

  const set = (key) => (value) => {
    setF((previous) => ({ ...previous, [key]: value?.target ? value.target.value : value }));
    setErrors((previous) => ({ ...previous, [key]: null }));
  };
  const uploadState = (key) => (value) => setUploads((previous) => ({ ...previous, [key]: value }));
  const selectCategories = (value) => {
    if (value.length > 5) return setErrors((previous) => ({ ...previous, categories: "Escolha até 5 áreas de atuação." }));
    set("categories")(value);
  };
  const locate = () => {
    if (locating) return;
    if (!navigator.geolocation) return toast.error("Este navegador não oferece localização. Informe seu bairro e cidade.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!mounted.current) return;
        setLocating(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        toast.success("Localização capturada. Salve para atualizar o perfil.");
      },
      () => {
        if (!mounted.current) return;
        setLocating(false);
        toast.error("Não foi possível obter a localização. Confira a permissão do navegador e tente novamente.");
      },
      { timeout: 15000 },
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    if (uploading || locating || saving.current || !dirty) return;
    const roles = [...new Set(f.custom_roles.split(",").map((role) => role.trim()).filter(Boolean))];
    const categories = [...new Set([...f.categories, ...(roles.length ? ["outros"] : [])])];
    const rate = f.hourly_rate === "" ? null : Number(f.hourly_rate);
    const invalid = {};
    if (f.name.trim().length < 2) invalid.name = "Informe seu nome com pelo menos 2 caracteres.";
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100000)) invalid.hourly_rate = "Informe um valor entre R$ 0 e R$ 100.000.";
    if (roles.length > 5 || roles.some((role) => role.length < 2 || role.length > 80)) invalid.custom_roles = "Informe até 5 funções, cada uma com 2 a 80 caracteres.";
    if (categories.length > 5) invalid.categories = "Escolha até 5 áreas. Funções fora da lista também usam a área Outros.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      const key = Object.keys(invalid)[0];
      form.current?.querySelector(`[data-profile-field="${key}"]`)?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      const body = { ...f, categories, custom_roles: roles, name: f.name.trim(), hourly_rate: rate, ...(pos || {}) };
      if (f.avatar === initial.avatar) delete body.avatar;
      if (f.cover === initial.cover) delete body.cover;
      const { data } = await api.put("/me", body);
      setMe(data);
      toast.success("Perfil atualizado");
      onSaved?.();
      onSavedClose();
    } catch (error) {
      setSaveError(errMsg(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const inputProps = (key, id) => ({ id, "data-profile-field": key, "aria-invalid": !!errors[key], "aria-describedby": errors[key] ? `${id}-error` : undefined });
  return (
    <form ref={form} onSubmit={submit} className="space-y-4" aria-busy={busy || uploading} noValidate>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <Field label="Imagem de capa">
          <ImageUpload allowReplace value={f.cover} onChange={set("cover")} onBusyChange={uploadState("cover")} className="h-36 w-full sm:h-40" testid="edit-cover" label="Adicionar imagem de capa" />
          <p className="text-xs text-muted-foreground">Imagem horizontal de até 4 MB.</p>
        </Field>
        <div className="flex items-center gap-4">
          <ImageUpload allowReplace value={f.avatar} onChange={set("avatar")} onBusyChange={uploadState("avatar")} className="h-24 w-24 shrink-0 rounded-none" testid="edit-avatar" label="Foto" />
          <p className="flex-1 text-sm text-muted-foreground">Conta única para contratar e trabalhar. Preencha seus serviços se quiser aparecer nas buscas.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" id="edit-profile-name" error={errors.name}><Input {...inputProps("name", "edit-profile-name")} value={f.name} onChange={set("name")} required minLength={2} maxLength={80} autoComplete="name" data-testid="edit-name-input" /></Field>
          <Field label="Bairro / cidade" id="edit-profile-city"><Input id="edit-profile-city" value={f.city} onChange={set("city")} maxLength={80} placeholder="Ex.: Setor Bueno, Goiânia" data-testid="edit-city-input" /></Field>
        </div>
        <Field label="Serviços que você oferece (opcional)" id="edit-profile-categories" group error={errors.categories}>
          <div {...inputProps("categories", "edit-profile-categories")} role="group" aria-labelledby="edit-profile-categories-label" tabIndex={-1}>
            <CategoryChips value={f.categories} onChange={selectCategories} includeAll={false} multiple testid="edit-category" />
          </div>
          <p className="text-xs text-muted-foreground">{f.categories.length} de 5 áreas selecionadas.</p>
        </Field>
        <Field label="Funções fora da lista" id="edit-profile-roles" error={errors.custom_roles}><Input {...inputProps("custom_roles", "edit-profile-roles")} value={f.custom_roles} onChange={set("custom_roles")} placeholder="Ex.: Montador de móveis, cuidador" maxLength={400} /><p className="text-xs text-muted-foreground">Separe por vírgulas. Até 5 funções.</p></Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Profissão ou especialidade" id="edit-profile-headline"><Input id="edit-profile-headline" value={f.headline} onChange={set("headline")} maxLength={120} placeholder="Ex.: Eletricista residencial" data-testid="edit-headline-input" /></Field>
          <Field label="Valor por hora (R$)" id="edit-profile-rate" error={errors.hourly_rate}><Input {...inputProps("hourly_rate", "edit-profile-rate")} type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={f.hourly_rate} onChange={set("hourly_rate")} placeholder="Opcional" data-testid="edit-rate-input" /></Field>
        </div>
        <Field label="Sobre você" id="edit-profile-bio"><Textarea id="edit-profile-bio" value={f.bio} onChange={set("bio")} rows={3} maxLength={1000} data-testid="edit-bio-input" /></Field>
        <Button type="button" variant="outline" disabled={locating} className="min-h-12 w-full whitespace-normal rounded-none" onClick={locate} data-testid="edit-locate-button">
          {locating ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : <Crosshair aria-hidden="true" className="h-4 w-4 shrink-0" />} {locating ? "Buscando localização…" : pos ? "Capturar localização novamente" : "Atualizar minha localização no mapa"}
        </Button>
      </fieldset>
      <p role="status" className="text-sm text-muted-foreground" data-testid="edit-profile-status">{busy ? "Salvando perfil…" : uploading ? "Enviando imagem. Aguarde para salvar." : locating ? "Buscando sua localização…" : dirty ? "Você tem alterações para salvar." : "Seu perfil está atualizado."}</p>
      {saveError && <p role="alert" className="text-sm text-destructive" data-testid="edit-profile-error">{saveError} Suas alterações continuam aqui.</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" disabled={busy || uploading} onClick={onClose} data-testid="edit-profile-cancel-button">Cancelar</Button>
        <Button type="submit" disabled={busy || uploading || locating || !dirty} className="min-h-12 flex-1 rounded-none text-base font-semibold" data-testid="edit-profile-submit-button">
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />} {busy ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
});

export const EditProfileDialog = ({ open, onOpenChange, onSaved }) => {
  const form = useRef(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const requestClose = () => {
    if (form.current?.busy || form.current?.uploading) {
      toast.info("Aguarde o envio terminar para fechar.");
      return;
    }
    if (form.current?.dirty) setDiscardOpen(true);
    else onOpenChange(false);
  };
  useEffect(() => { if (!open) setDiscardOpen(false); }, [open]);
  return (
    <>
      <Dialog open={open} onOpenChange={(value) => value ? onOpenChange(true) : requestClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-none sm:max-w-xl" data-testid="edit-profile-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl font-extrabold">Editar perfil</DialogTitle>
            <DialogDescription>Essas informações aparecem para outros usuários.</DialogDescription>
          </DialogHeader>
          {open && <ProfileForm ref={form} onSaved={onSaved} onClose={requestClose} onSavedClose={() => onOpenChange(false)} />}
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações do perfil?</AlertDialogTitle>
            <AlertDialogDescription>As alterações ainda não foram salvas. Você pode continuar editando.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDiscardOpen(false); onOpenChange(false); }}>Descartar alterações</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
