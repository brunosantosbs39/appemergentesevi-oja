import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
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

export const RequestForm = ({ targetPro, onCreated, onClose }) => {
  const timeInput = useRef(null);
  const api = useApi();
  const { me } = useMe();
  const [f, setF] = useState({
    billing_type: "fixed", quantity: "1",
    company_id: "", branch_id: "", service_date: "", daily_count: "1",
    category: targetPro?.categories?.[0] || "eletricista",
    title: "",
    description: "",
    budget: "",
    expires_at: "",
    address: targetPro ? "" : me.city || "", category_detail: "", service_time: "",
  });
  const companyList = useQuery({queryKey:["companies",me.user_id],queryFn:async()=>(await api.get("/companies")).data});
  const [pos, setPos] = useState(me.lat != null ? { lat: me.lat, lng: me.lng } : DEFAULT_POS);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));

  const unit = f.branch_id ? companyList.data?.branches.find(b=>b.id===f.branch_id) : companyList.data?.companies.find(c=>c.id===f.company_id);
  const savedAddress = targetPro && unit?.address?.trim();
  const selectDate = e => {
    const date = e.target.value;
    setF(s=>({...s, service_date:date}));
    if (date) {
      timeInput.current?.focus();
      try { timeInput.current?.showPicker?.(); } catch { /* The time input remains focused. */ }
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (f.title.trim().length < 3) return toast.error("Descreva o serviço no título");
    setBusy(true);
    try {
      const body = { ...f, address:savedAddress || f.address.trim(), service_time:targetPro ? f.service_time : null, category_detail:f.category==="outros" ? f.category_detail.trim() : "", company_id:f.company_id||null, branch_id:f.branch_id||null, service_date:f.service_date||null, daily_count:Number(f.daily_count), expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null, budget: null, unit_cents:f.budget===""?null:Math.round(Number(f.budget)*100), quantity:f.billing_type==="fixed"?1:Number(f.quantity), lat: pos.lat, lng: pos.lng, image, target_pro_id: targetPro?.user_id || null };
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
        {f.category==="outros" && <label className="block text-sm">Qual é a categoria?<Input value={f.category_detail} onChange={set("category_detail")} required minLength={2} maxLength={100} /></label>}
        {!targetPro && <Field label="Tipo de contratação"><select className="w-full border border-border bg-background p-3" value={f.billing_type} onChange={e=>setF(s=>({...s,billing_type:e.target.value,quantity:"1"}))}><option value="daily">Diária</option><option value="hourly">Por hora</option><option value="fixed">Orçamento fechado</option></select></Field>}
        <Field label={f.billing_type==="daily"?"Valor da diária (R$)":f.billing_type==="hourly"?"Valor por hora (R$)":"Orçamento total (R$)"}>
          <Input type="number" required={!!targetPro} min={targetPro ? "0.01" : "0"} step="0.01" inputMode="decimal" value={f.budget} onChange={set("budget")} placeholder="A combinar" data-testid="request-budget-input" />
        </Field>
      </div>
      {f.billing_type!=="fixed"&&<label className="block text-sm">{f.billing_type==="hourly"?"Quantidade de horas":"Quantidade de diárias"}<Input type="number" min={f.billing_type==="hourly"?"0.01":"1"} max="10000" step={f.billing_type==="hourly"?"0.01":"1"} value={f.quantity} onChange={set("quantity")} required/></label>}
      {!targetPro && <p className="text-sm">Total previsto: {f.budget===""?"A combinar":(Number(f.budget)*(f.billing_type==="fixed"?1:Number(f.quantity))).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p>}
      {(!targetPro || !!companyList.data?.companies.length) && <fieldset className="space-y-3 border border-border p-3"><legend>Empresa / filial (opcional)</legend>
        <label className="block text-sm">Empresa<select className="mt-1 w-full border border-border bg-background p-2" value={f.company_id} onChange={e=>setF(s=>({...s,company_id:e.target.value,branch_id:""}))}><option value="">Pedido pessoal</option>{companyList.data?.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {companyList.error&&<p role="alert">Não foi possível carregar empresas. Reabra o formulário para tentar novamente.</p>}
        {f.company_id&&<><label className="block text-sm">Unidade<select className="mt-1 w-full border border-border bg-background p-2" value={f.branch_id} onChange={set("branch_id")}><option value="">Matriz</option>{companyList.data?.branches.filter(b=>b.company_id===f.company_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{!targetPro && <><label className="block text-sm">Data de competência<Input type="date" value={f.service_date} onChange={set("service_date")} required/></label><p className="text-xs">O total é calculado conforme o tipo de contratação. O painel acompanha alterações do valor combinado e do andamento do pedido.</p></>}</>}
      </fieldset>}
      <Field label="O que você precisa?">
        <Input value={f.title} onChange={set("title")} maxLength={100} placeholder="Ex.: Trocar chuveiro queimado" data-testid="request-title-input" />
      </Field>
      {targetPro && <div className="grid gap-3 sm:grid-cols-2">
        <label>Data do serviço<Input type="date" value={f.service_date} onChange={selectDate} required /></label>
        <label>Hora de início<Input ref={timeInput} type="time" value={f.service_time} onChange={set("service_time")} required /></label>
      </div>}
      {!targetPro && <><Field label="Detalhes">
        <Textarea value={f.description} onChange={set("description")} rows={3} maxLength={2000} placeholder="Conte mais sobre o serviço, horário preferido..." data-testid="request-description-input" />
      </Field>
      <Field label="Receber candidaturas até (opcional)">
        <Input type="datetime-local" value={f.expires_at} onChange={set("expires_at")} />
        <p className="text-xs text-muted-foreground">Horário local do aparelho. A vaga sai da divulgação no prazo definido. Serviços aprovados continuam no histórico.</p>
      </Field>
      </>}
      <Field label={savedAddress ? "Endereço da unidade selecionada" : "Endereço do serviço"}>
        <Input required={!!targetPro} readOnly={!!savedAddress} value={savedAddress || f.address} onChange={set("address")} maxLength={200} placeholder="Ex.: Rua das Flores, 120 - Pinheiros" data-testid="request-address-input" />
      </Field>
      {targetPro ? <details><summary>Ajustar ponto no mapa (opcional)</summary><LocationPicker value={pos} onChange={setPos} testid="request-location" /></details> : <LocationPicker value={pos} onChange={setPos} testid="request-location" />}
      {!targetPro && <Field label="Foto (opcional)">
        <ImageUpload value={image} onChange={setImage} className="h-32" testid="request-image" />
      </Field>}
      {targetPro && <p className="text-sm">Ao aceitar, o profissional confirma o serviço e o valor combinado é reservado na sua carteira.</p>}
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
        <DialogDescription>{targetPro ? "Envie o serviço para este profissional aceitar em Pedidos." : "Você recebe candidaturas e escolhe quem aprovar."}</DialogDescription>
      </DialogHeader>
      {open && <RequestForm targetPro={targetPro} onCreated={onCreated} onClose={() => onOpenChange(false)} />}
    </DialogContent>
  </Dialog>
);
