import { useState } from "react";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { CATEGORIES, DEFAULT_POS } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUpload } from "@/components/common/ImageUpload";
import { LocationPicker } from "@/components/map/LocationPicker";

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);

const RequestForm = ({ targetPro, onCreated, onClose }) => {
  const api = useApi();
  const { me } = useMe();
  const [f, setF] = useState({
    category: targetPro?.categories?.[0] || "eletricista",
    title: "",
    description: "",
    budget: "",
    address: me.city || "",
  });
  const [pos, setPos] = useState(me.lat != null ? { lat: me.lat, lng: me.lng } : DEFAULT_POS);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (f.title.trim().length < 3) return toast.error("Descreva o serviço no título");
    setBusy(true);
    try {
      const body = { ...f, budget: f.budget === "" ? null : Number(f.budget), lat: pos.lat, lng: pos.lng, image, target_pro_id: targetPro?.user_id || null };
      const { data } = await api.post("/requests", body);
      toast.success(targetPro ? `Pedido enviado para ${targetPro.name}` : "Pedido publicado! Profissionais próximos já podem ver.");
      onCreated?.(data);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {targetPro && (
        <div className="flex items-center gap-2 rounded-none bg-amber-50 p-3 text-sm text-amber-900" data-testid="request-target-banner">
          <Target className="h-4 w-4" /> Pedido direto para <strong>{targetPro.name}</strong>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria">
          <Select value={f.category} onValueChange={set("category")}>
            <SelectTrigger data-testid="request-category-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Orçamento estimado (R$)">
          <Input type="number" min="0" step="1" inputMode="decimal" value={f.budget} onChange={set("budget")} placeholder="A combinar" data-testid="request-budget-input" />
        </Field>
      </div>
      <Field label="O que você precisa?">
        <Input value={f.title} onChange={set("title")} maxLength={100} placeholder="Ex.: Trocar chuveiro queimado" data-testid="request-title-input" />
      </Field>
      <Field label="Detalhes">
        <Textarea value={f.description} onChange={set("description")} rows={3} maxLength={2000} placeholder="Conte mais sobre o serviço, horário preferido..." data-testid="request-description-input" />
      </Field>
      <Field label="Endereço / bairro">
        <Input value={f.address} onChange={set("address")} maxLength={200} placeholder="Ex.: Rua das Flores, 120 - Pinheiros" data-testid="request-address-input" />
      </Field>
      <LocationPicker value={pos} onChange={setPos} testid="request-location" />
      <Field label="Foto (opcional)">
        <ImageUpload value={image} onChange={setImage} className="h-32" testid="request-image" />
      </Field>
      <Button type="submit" disabled={busy} className="h-12 w-full rounded-none text-base font-semibold" data-testid="request-submit-button">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {targetPro ? "Enviar pedido" : "Publicar pedido"}
      </Button>
    </form>
  );
};

export const CreateRequestDialog = ({ open, onOpenChange, targetPro, onCreated }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-none sm:max-w-xl" data-testid="create-request-dialog">
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl font-extrabold">Novo pedido de serviço</DialogTitle>
        <DialogDescription>Profissionais próximos recebem seu pedido e podem aceitar na hora.</DialogDescription>
      </DialogHeader>
      {open && <RequestForm targetPro={targetPro} onCreated={onCreated} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>
);
