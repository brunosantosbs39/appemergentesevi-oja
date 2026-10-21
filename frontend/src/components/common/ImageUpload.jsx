import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { errMsg, imgUrl, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const ImageUpload = ({ value, onChange, testid = "image-upload", className, label = "Adicionar foto" }) => {
  const api = useApi();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("A imagem deve ter até 8 MB");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      onChange(data.path);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50", className)}>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid={`${testid}-input`} />
      {value ? (
        <>
          <img src={imgUrl(value)} alt="Prévia" className="h-full w-full object-cover" data-testid={`${testid}-preview`} />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-slate-900/80 p-1.5 text-white backdrop-blur transition-colors hover:bg-slate-900"
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
          className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 text-slate-500 transition-colors hover:text-emerald-700"
          data-testid={`${testid}-button`}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-sm font-medium">{busy ? "Enviando..." : label}</span>
        </button>
      )}
    </div>
  );
};
