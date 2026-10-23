import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { errMsg, imgUrl, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const ImageUpload = ({ value, onChange, testid = "image-upload", className, label = "Adicionar foto", onBusyChange, allowReplace = false }) => {
  const api = useApi();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("A imagem deve ter até 4 MB");
    setBusy(true);
    onBusyChange?.(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      onChange(data.path);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div className={cn("relative overflow-hidden rounded-none border-2 border-dashed border-border bg-card", className)}>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid={`${testid}-input`} />
      {value ? (
        <>
          <img src={imgUrl(value)} alt="Prévia" className="h-full w-full object-cover" data-testid={`${testid}-preview`} />
          {allowReplace && <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="absolute bottom-2 right-2 bg-black/80 px-3 py-2 text-sm text-white" data-testid={`${testid}-replace`}>{busy ? "Enviando..." : "Trocar imagem"}</button>}
          <button
            type="button"
            disabled={busy}
            aria-label="Remover imagem"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-none bg-secondary/80 p-1.5 text-white backdrop-blur transition-colors hover:bg-secondary"
            data-testid={`${testid}-remove`}
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          data-testid={`${testid}-button`}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-sm font-medium">{busy ? "Enviando..." : label}</span>
        </button>
      )}
    </div>
  );
};
