import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";

const stamp = (value) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
}).format(new Date(value));
const duration = (seconds) => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return minutes < 1 ? "Menos de 1 minuto" : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
};

export const ServiceAttendance = ({ request }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!request.check_in_at || request.status !== "em_andamento") return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [request.check_in_at, request.status]);
  if (!request.check_in_at && !request.check_out_at) return null;
  const elapsed = request.service_duration_seconds ?? (request.status === "em_andamento" && request.check_in_at ? (now - new Date(request.check_in_at).getTime()) / 1000 : null);
  return <section className="mt-4 space-y-2 border border-border bg-background p-3 text-xs" aria-label="Registro de início e fim do serviço" data-testid="service-attendance">
    <p className="font-semibold text-foreground">Registro do serviço</p>
    {request.check_in_at && <p className="flex items-center gap-2"><LogIn className="h-4 w-4 shrink-0" /><span>Check-in: <time dateTime={request.check_in_at}>{stamp(request.check_in_at)}</time></span></p>}
    {request.check_out_at ? <p className="flex items-center gap-2"><LogOut className="h-4 w-4 shrink-0" /><span>Check-out: <time dateTime={request.check_out_at}>{stamp(request.check_out_at)}</time></span></p> : request.status === "em_andamento" ? <p className="text-emerald-600">Serviço em andamento · aguardando check-out</p> : <p>Serviço encerrado sem check-out</p>}
    {elapsed != null && <p className="flex items-center gap-2"><Clock className="h-4 w-4" />{request.check_out_at ? "Duração registrada" : "Tempo decorrido"}: {duration(elapsed)}</p>}
    <p className="text-muted-foreground">Horários de Brasília.</p>
  </section>;
};
