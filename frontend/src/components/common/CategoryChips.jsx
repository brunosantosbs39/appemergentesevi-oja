import { LayoutGrid } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const CategoryChips = ({ value, onChange, includeAll = true, multiple = false, testid = "category-chip" }) => {
  const items = includeAll ? [{ slug: "todos", label: "Todos", icon: LayoutGrid }, ...CATEGORIES] : CATEGORIES;
  const isOn = (s) => (multiple ? value.includes(s) : value === s);
  const toggle = (s) => {
    if (!multiple) return onChange(s);
    onChange(value.includes(s) ? value.filter((v) => v !== s) : [...value, s]);
  };
  return (
    <div className={cn("flex gap-2", multiple ? "flex-wrap" : "no-scrollbar -mx-1 overflow-x-auto px-1 pb-1")}>
      {items.map(({ slug, label, icon: Icon }) => (
        <button
          key={slug}
          type="button"
          onClick={() => toggle(slug)}
          data-testid={`${testid}-${slug}`}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
            isOn(slug)
              ? "border-border bg-secondary text-white"
              : "border-border bg-card text-foreground hover:border-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
};
