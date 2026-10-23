import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatThread } from "@/components/chat/ChatThread";
import "@/components/chat/chat.css";

export default function Chat() {
  const { id } = useParams();
  const [height, setHeight] = useState(() => window.visualViewport?.height || window.innerHeight);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const resize = () => setHeight(window.visualViewport?.height || window.innerHeight);
    window.visualViewport?.addEventListener("resize", resize); window.addEventListener("resize", resize);
    return () => { document.body.style.overflow = previous; window.visualViewport?.removeEventListener("resize", resize); window.removeEventListener("resize", resize); };
  }, []);
  return <div className={`sj-chat ${id ? "thread-open" : ""}`} style={{ height }} data-testid="chat-page">
    <div className="sj-inbox-pane"><ConversationList /></div>
    <div className="sj-thread-pane">{id ? <ChatThread key={id} id={id} /> : <div className="sj-welcome"><div className="sj-welcome-icon"><MessageCircle size={48} strokeWidth={1.3} /></div><h2>Uma boa conversa resolve.</h2><p>Selecione uma conversa para combinar o serviço,<br />negociar valores e acompanhar cada etapa.</p><span>ServiçoJá · Pessoas perto de você</span></div>}</div>
  </div>;
}
