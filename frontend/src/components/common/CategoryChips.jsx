import { useId, useState } from "react";
import { LayoutGrid, Search, X } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import { matchesCategory } from "@/lib/categorySearch.mjs";
import { cn } from "@/lib/utils";

export const CategoryChips = ({ value, onChange, includeAll = true, multiple = false, searchOnly = false, testid = "category-chip" }) => {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const matches = CATEGORIES.filter(category => matchesCategory(category, query));
  const items = includeAll ? [{ slug: "todos", label: "Todos", icon: LayoutGrid }, ...matches] : matches;
  const isOn = slug => multiple ? (value || []).includes(slug) : value === slug;
  const selected = CATEGORIES.filter(category => isOn(category.slug));
  const toggle = slug => {
    if (!multiple) return onChange(slug);
    const previous = value || [];
    onChange(previous.includes(slug) ? previous.filter(item => item !== slug) : [...previous, slug]);
  };
  return (
    <div className="min-w-0 space-y-3">
      <label htmlFor={searchId} className="block text-sm font-medium">Pesquisar categorias e áreas de atuação</label>
      <div className="relative max-w-xl">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <input id={searchId} type="search" value={query} onChange={event => { setQuery(event.target.value); if (searchOnly && !event.target.value) onChange("todos"); }}
          placeholder="Ex.: eletricista, limpeza, shows..."
          autoComplete="off" maxLength={100} data-testid={testid + "-search"}
          className="min-h-11 w-full rounded-none border border-border bg-card py-2 pl-10 pr-12 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {query && <button type="button" onClick={() => { setQuery(""); if (searchOnly) onChange("todos"); }} aria-label="Limpar pesquisa de categorias"
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center"><X aria-hidden="true" className="h-4 w-4" /></button>}
      </div>
      {!searchOnly && selected.length > 0 && query && <p className="text-xs text-muted-foreground">Seleção atual: {selected.map(item => item.label).join(", ")}. Pesquisar não altera sua seleção.</p>}
      {(!searchOnly || (query.trim() && selected[0]?.label !== query)) && <div className={cn("sj-category-options flex gap-2", multiple || query ? "flex-wrap" : "no-scrollbar -mx-1 overflow-x-auto px-1 pb-1")}>
        {items.map(({ slug, label, icon: Icon }) => (
          <button key={slug} type="button" onClick={() => { toggle(slug); if(searchOnly) setQuery(slug==="todos"?"":label); }} aria-pressed={isOn(slug)}
            data-testid={testid + "-" + slug}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
              isOn(slug) ? "border-border bg-secondary text-secondary-foreground" : "border-border bg-card text-foreground hover:border-foreground hover:text-foreground")}>
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>}
      {query && !searchOnly && <p role="status" className="text-xs text-muted-foreground">{matches.length ? matches.length + " áreas encontradas. Selecione uma para aplicar." : "Nenhuma área encontrada. Tente outro termo ou limpe a pesquisa."}</p>}
    </div>
  );
};
