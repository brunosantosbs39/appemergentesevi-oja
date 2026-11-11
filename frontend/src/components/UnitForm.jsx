import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

const fields = [
  ["postal_code","CEP",9],["street","Rua ou avenida",150],["number","Número",20],
  ["complement","Complemento (opcional)",100],["district","Bairro",100],["city","Cidade",80],["state","UF",2]
];

export default function UnitForm({title, initial, busy, onSave, edit=false}) {
  const api = useApi();
  const [address,setAddress] = useState(initial?.address_fields || {});
  const [name,setName] = useState(initial?.name || "");
  const [coords,setCoords] = useState({lat:initial?.lat ?? null,lng:initial?.lng ?? null});
  const [changedCep,setChangedCep] = useState(false);
  const [hint,setHint] = useState("");
  const cep = (address.postal_code || "").replace(/\D/g,"");
  useEffect(() => {
    if (!changedCep || cep.length !== 8) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const {data} = await api.get("/me/address/"+cep);
        if (!active) return;
        setAddress(old=>({...old,...Object.fromEntries(["street","district","city","state"].filter(k=>data[k]).map(k=>[k,data[k]]))}));
        setCoords({lat:data.lat ?? null,lng:data.lng ?? null});
        setHint("Confira o endereço e informe o número.");
      } catch { if(active) setHint("Preencha o endereço manualmente."); }
    },350);
    return () => { active=false;clearTimeout(timer); };
  },[api,cep,changedCep]);
  const change = (key,value) => {
    if(key === "postal_code") {setChangedCep(true);setCoords({lat:null,lng:null});setHint("");}
    setAddress(old=>({...old,[key]:key==="state"?value.toUpperCase():value}));
  };
  return <>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{
      e.preventDefault(); onSave({name:name.trim(),address_fields:{...address,postal_code:cep},...coords});
    }}>
      {<label className="sm:col-span-2">Nome da unidade<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full border bg-background p-3" /></label>}
      {initial?.address && !initial.address_fields && <p className="sm:col-span-2">Endereço atual: {initial.address}</p>}
      {fields.map(([key,label,max])=><label key={key}>{label}<input className="mt-1 w-full border bg-background p-3" required={key!=="complement"} maxLength={max} pattern={key==="postal_code"?"[0-9]{5}-?[0-9]{3}":key==="state"?"[A-Z]{2}":undefined} value={address[key] || ""} onChange={e=>change(key,e.target.value)} /></label>)}
      {hint && <p role="status">{hint}</p>}
      <Button disabled={busy} className="sm:col-span-2">{edit?"Salvar alterações":title}</Button>
    </form>
  </>;
}
