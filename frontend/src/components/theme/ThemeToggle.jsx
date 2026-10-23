import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ThemeToggle = ({ compact = false }) => {
  const { resolvedTheme, setTheme } = useTheme();
  const light = resolvedTheme === "light";
  const label = light ? "Ativar modo escuro" : "Ativar modo claro";
  return <Button type="button" variant="ghost" size={compact ? "icon" : "default"} onClick={() => setTheme(light ? "dark" : "light")} aria-label={label} title={label} aria-pressed={light} data-testid="theme-toggle" className="theme-toggle shrink-0">
    {light ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    {!compact && (light ? "Modo escuro" : "Modo claro")}
  </Button>;
};

export const ThemeChrome = () => {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "light" ? "#f5f7fa" : "#000000");
  }, [resolvedTheme]);
  return null;
};
