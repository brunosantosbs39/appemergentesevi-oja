import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Logo } from "@/components/common/Misc";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import "./AuthPages.css";

function PickPoint({ onPick }) {
  const map = useMapEvents({click: e => onPick({lat:e.latlng.lat,lng:e.latlng.lng})});
  return <button type="button" style={{position:"absolute",bottom:22,left:12,zIndex:1000,background:"#fff",color:"#000",padding:"8px 12px"}} onClick={e=>{e.stopPropagation();const center=map.getCenter();onPick({lat:center.lat,lng:center.lng});}}>Usar centro do mapa</button>;
}
const empty = {postal_code:"",street:"",number:"",complement:"",district:"",city:"",state:""};

export default function Onboarding() {
  const { me, setMe } = useMe();
  const { user } = useUser();
  const api = useApi(), navigate = useNavigate();
  const [name,setName] = useState(me.name || user?.fullName || "");
  const [address,setAddress] = useState({...empty,...me.address});
  const [region,setRegion] = useState(null), [point,setPoint] = useState(null);
  const [busy,setBusy] = useState(false), [looking,setLooking] = useState(false);
  const [error,setError] = useState(""), [confirmed,setConfirmed] = useState(false);
  const generation = useRef(0);
  const lookupTimer = useRef(null);
  const postalDigits = address.postal_code.replace(/\D/g,"");
  const change = (key,value) => {
    setAddress(prev=>({...prev,[key]:value}));
    setConfirmed(false);
    if(key==="postal_code" && value.replace(/\D/g, "") !== postalDigits){generation.current++;clearTimeout(lookupTimer.current);setRegion(null);setPoint(null);setLooking(false);setError("");setAddress(prev=>({...prev,street:"",district:"",city:"",state:""}));}
  };
  const lookup = useCallback(async () => {
    clearTimeout(lookupTimer.current);
    const cep=postalDigits;
    if(cep.length!==8){setError("Informe um CEP com 8 dígitos.");return;}
    const version=++generation.current;setLooking(true);setError("");
    try {
      const {data}=await api.get("/me/address/"+cep);
      if(version!==generation.current)return;
      setRegion(data);setPoint(null);setConfirmed(false);
      setAddress(prev=>({...prev,postal_code:cep,street:data.street || "",district:data.district || "",city:data.city || "",state:data.state || ""}));
    } catch(e){if(version===generation.current)setError(errMsg(e));}
    finally{if(version===generation.current)setLooking(false);}
  }, [api, postalDigits]);
  const invalidateLookup = useCallback(() => {generation.current++;}, []);
  useEffect(() => {
    if(postalDigits.length===8 && !me.registration_complete) lookupTimer.current=setTimeout(lookup,350);
    return () => {clearTimeout(lookupTimer.current);invalidateLookup();};
  }, [postalDigits, lookup, me.registration_complete, invalidateLookup]);
  if(me.registration_complete) return <Navigate to="/mapa" replace />;
  const save = async e => {
    e.preventDefault();
    if(!region || region.postal_code!==address.postal_code.replace(/\D/g,"")){setError("Consulte seu CEP antes de concluir.");return;}
    if(!confirmed){setError("Confirme o endereço e a região informados.");return;}
    if(region.lat==null && !point){setError("Selecione sua região no mapa.");return;}
    setBusy(true);setError("");
    try{
      const {data}=await api.put("/me/registration",{name:name.trim(),address,location:point});
      setMe(data);navigate("/mapa",{replace:true});
    }catch(e){setError(errMsg(e));}finally{setBusy(false);}
  };
  const field = (key,label,autocomplete,options={}) => <label className="access-field" htmlFor={"registration-"+key}>{label}<input id={"registration-"+key} value={address[key]} onChange={e=>change(key,e.target.value)} autoComplete={autocomplete} required={key!=="complement"} maxLength={key==="number"?20:key==="complement"?100:150} {...options}/></label>;
  return <div className="access-page">
    <header><Logo /><div className="flex items-center gap-3"><ThemeToggle compact /><LogoutButton /></div></header>
    <main className="access-card registration-card">
      <h1>Complete seu cadastro</h1>
      <p className="access-subtitle">Etapa 2 de 2 · Obrigatória para todos, inclusive quem entra com Google. Seu endereço define a região inicial de oportunidades.</p>
      <form onSubmit={save}>
        <label className="access-field" htmlFor="registration-name">Nome completo<input id="registration-name" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} /></label>
        <label className="access-field" htmlFor="registration-email">E-mail da conta<input id="registration-email" type="email" value={user?.primaryEmailAddress?.emailAddress || ""} readOnly /></label>
        <h2>Seu endereço</h2>
        <p className="access-hint">Rua, número e complemento ficam no seu cadastro privado. O mapa usa uma região aproximada, que você pode ajustar.</p>
        <div className="registration-grid">
          {field("postal_code","CEP","postal-code",{inputMode:"numeric",maxLength:9,placeholder:"00000-000"})}
          <div><button type="button" className="access-google" disabled={looking || busy} onClick={lookup}>{looking?"Consultando…":"Buscar endereço pelo CEP"}</button></div>
          <p className="access-hint registration-full" role="status" aria-live="polite">{looking ? "Buscando endereço…" : region ? (!region.street || !region.district ? "Região encontrada. Complete a rua e o bairro que não vieram na consulta." : "Endereço preenchido. Confira os dados e informe o número.") : "Digite os 8 números do CEP para preencher o endereço automaticamente."}</p>
          <div className="registration-full">{field("street","Rua / avenida","address-line1")}</div>
          {field("number","Número (ou S/N)","off")}
          {field("complement","Complemento (opcional)","address-line2")}
          {field("district","Bairro","address-level3")}
          {field("city","Cidade","address-level2",{readOnly:true})}
          {field("state","Estado","address-level1",{readOnly:true,maxLength:2})}
        </div>
        {region && <section className="registration-region" aria-label="Sua região">
          <p><strong>{region.city} / {region.state}</strong></p>
          <p className="access-hint">{region.lat!=null ? "Usaremos a região aproximada do CEP. Se necessário, toque no mapa para ajustar." : "O CEP não possui coordenadas. Aproxime o mapa e toque na sua região para continuar."}</p>
          <MapContainer key={region.postal_code} center={region.lat!=null?[region.lat,region.lng]:[-14,-52]} zoom={region.lat!=null?13:4} style={{height:280,width:"100%"}}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <PickPoint onPick={p=>{setPoint(p);setConfirmed(false);}} />
            {(point || region.lat!=null) && <CircleMarker center={point?[point.lat,point.lng]:[region.lat,region.lng]} radius={10} />}
          </MapContainer>
          <p role="status" className="access-hint">{point?"Ponto escolhido no mapa.":"Região aproximada do CEP."} Você poderá usar “Minha localização” dentro do app quando desejar.</p>

        </section>}
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1" />Confirmo meu endereço e a região que será usada para encontrar oportunidades.</label>
        {error && <p role="alert" className="access-error">{error}</p>}
        <button className="access-primary" disabled={busy || looking}>{busy?"Salvando cadastro…":"Concluir cadastro e ver minha região"}</button>
      </form>
    </main>
  </div>;
}
