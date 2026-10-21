import { useParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatThread } from "@/components/chat/ChatThread";
import { cn } from "@/lib/utils";

export default function Chat() {
  const { id } = useParams();
  return (
    <div className="grid h-[calc(100dvh-10.5rem)] gap-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[340px_minmax(0,1fr)]" data-testid="chat-page">
      <div className={cn("min-h-0", id && "hidden lg:block")}>
        <ConversationList />
      </div>
      <div className={cn("min-h-0", id ? "flex" : "hidden lg:flex")}>
        {id ? (
          <ChatThread key={id} id={id} />
        ) : (
          <div className="flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center">
            <MessageCircle className="h-8 w-8 text-emerald-600" />
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">Selecione uma conversa</p>
            <p className="text-sm text-slate-500">Combine detalhes, valores e horários direto por aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
}
