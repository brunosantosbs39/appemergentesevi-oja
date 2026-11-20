import { useState } from "react";
import { ClientRequests } from "@/components/requests/ClientRequests";
import { ProRequests } from "@/components/requests/ProRequests";
import { Commitments } from "@/components/requests/Commitments";
import { Button } from "@/components/ui/button";

export default function Requests() {
  const [mode, setMode] = useState("opportunity");
  return <div>
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Como você quer usar os pedidos?">
      <Button variant={mode === "hire" ? "default" : "outline"} aria-pressed={mode === "hire"} className="h-auto min-h-12 whitespace-normal" onClick={() => setMode("hire")}>Quero contratar</Button>
      <Button variant={mode === "opportunity" ? "default" : "outline"} aria-pressed={mode === "opportunity"} className="h-auto min-h-12 whitespace-normal" onClick={() => setMode("opportunity")}>Busco uma oportunidade</Button>
      <Button variant={mode === "commitments" ? "default" : "outline"} aria-pressed={mode === "commitments"} className="col-span-2 h-auto min-h-12 whitespace-normal sm:col-span-1" onClick={() => setMode("commitments")} data-testid="commitments-button">Compromissos</Button>
    </div>
    <p className="mb-6 text-sm text-muted-foreground">Uma conta para os dois: contrate para sua casa ou empresa e encontre serviços para trabalhar.</p>
    {mode === "commitments" ? <Commitments /> : mode === "hire" ? <ClientRequests /> : <ProRequests />}
  </div>;
}
