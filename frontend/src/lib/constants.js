import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Zap, Droplets, PaintRoller, BrickWall, Hammer, Sparkles, Sprout, Scissors, Laptop, Camera,
  GraduationCap, Wrench, Sofa, Briefcase,
} from "lucide-react";

export const CATEGORIES = [
  { slug: "eletricista", label: "Eletricista", icon: Zap },
  { slug: "encanador", label: "Encanador", icon: Droplets },
  { slug: "pintor", label: "Pintor", icon: PaintRoller },
  { slug: "pedreiro", label: "Pedreiro", icon: BrickWall },
  { slug: "marceneiro", label: "Marceneiro", icon: Hammer },
  { slug: "diarista", label: "Diarista", icon: Sparkles },
  { slug: "jardineiro", label: "Jardineiro", icon: Sprout },
  { slug: "beleza", label: "Beleza", icon: Scissors },
  { slug: "ti_design", label: "T.I. & Design", icon: Laptop },
  { slug: "fotografo", label: "Fotógrafo", icon: Camera },
  { slug: "professor", label: "Aulas", icon: GraduationCap },
  { slug: "mecanico", label: "Mecânico", icon: Wrench },
  { slug: "montador", label: "Montador", icon: Sofa },
  { slug: "outros", label: "Outros", icon: Briefcase },
];

export const catOf = (slug) => CATEGORIES.find((c) => c.slug === slug) || CATEGORIES[CATEGORIES.length - 1];

export const STATUS = {
  pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  aceito: { label: "Aceito", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  em_andamento: { label: "Em andamento", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  concluido: { label: "Concluído", cls: "bg-teal-100 text-teal-800 border-teal-300" },
  cancelado: { label: "Cancelado", cls: "bg-rose-100 text-rose-800 border-rose-300" },
};

export const RADIUS_OPTIONS = [
  { v: 5, label: "5 km" },
  { v: 10, label: "10 km" },
  { v: 25, label: "25 km" },
  { v: 50, label: "50 km" },
  { v: 0, label: "Qualquer distância" },
];

export const DEFAULT_POS = { lat: -23.5505, lng: -46.6333 };

export const brl = (v) =>
  v == null ? "A combinar" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const km = (d) => {
  if (d == null) return "";
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace(".", ",")} km`;
};

export const ago = (iso) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }) : "");
