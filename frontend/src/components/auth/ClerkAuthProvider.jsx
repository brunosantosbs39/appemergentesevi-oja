import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import { useTheme } from "next-themes";

const darkAppearance = {
  variables: {
    colorPrimary: "#ffffff",
    colorPrimaryForeground: "#000000",
    colorForeground: "#ffffff",
    colorMutedForeground: "#b3b3b3",
    colorBackground: "#141414",
    colorInput: "#000000",
    colorInputForeground: "#ffffff",
    colorBorder: "#3a3a3a",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    cardBox: { border: "1px solid #262626", boxShadow: "none", borderRadius: 0 },
    card: { background: "#141414", borderRadius: 0 },
    headerTitle: { textTransform: "uppercase", fontWeight: 400, letterSpacing: ".08em" },
    socialButtonsBlockButton: { color: "#ffffff", background: "#202020", border: "1px solid #444" },
    footer: { background: "#141414" },
    footerActionText: { color: "#b3b3b3" },
    footerActionLink: { color: "#ffffff" },
    formButtonPrimary: { color: "#000000", background: "#ffffff", textTransform: "uppercase", letterSpacing: ".12em" },
  },
};

const lightAppearance = {
  variables: { ...darkAppearance.variables,
    colorPrimary: "#18212b", colorPrimaryForeground: "#ffffff", colorForeground: "#18212b",
    colorMutedForeground: "#61717b", colorBackground: "#ffffff", colorInput: "#f5f7fa",
    colorInputForeground: "#18212b", colorBorder: "#d9dee3",
  },
  elements: { ...darkAppearance.elements,
    cardBox: { border: "1px solid #d9dee3", boxShadow: "0 12px 35px #18212b0a", borderRadius: 0 },
    card: { background: "#ffffff", borderRadius: 0 },
    socialButtonsBlockButton: { color: "#18212b", background: "#f5f7fa", border: "1px solid #d9dee3" },
    footer: { background: "#f5f7fa" }, footerActionText: { color: "#61717b" },
    footerActionLink: { color: "#18212b" },
    formButtonPrimary: { ...darkAppearance.elements.formButtonPrimary, color: "#ffffff", background: "#18212b" },
  },
};

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

// Starts Clerk from the backend's runtime config, so deploy's live keys need no rebuild.
// Must render inside <BrowserRouter> (see step 3) so Clerk navigates without reloading.
export default function ClerkAuthProvider({ children }) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const appearance = resolvedTheme === "light" ? lightAppearance : darkAppearance;
  const [config, setConfig] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  // Retries while the backend restarts (e.g. right after provisioning): the app's
  // Clerk components crash if they ever render without <ClerkProvider>.
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const cfg = await (await fetch(`${BACKEND_URL}/api/clerk/config`)).json();
        if (cfg.enabled) return cancelled || setConfig(cfg);
      } catch {}
      if (cancelled) return;
      if (attempt >= 20) return setUnavailable(true);
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (unavailable) return <p role="alert" style={{ padding: 24 }}>O acesso está temporariamente indisponível. Tente novamente em instantes.</p>;
  if (!config) return null;
  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={appearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
