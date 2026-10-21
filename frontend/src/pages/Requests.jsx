import { useMe } from "@/context/MeContext";
import { ClientRequests } from "@/components/requests/ClientRequests";
import { ProRequests } from "@/components/requests/ProRequests";

export default function Requests() {
  const { me } = useMe();
  return me.role === "profissional" ? <ProRequests /> : <ClientRequests />;
}
