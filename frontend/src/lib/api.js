import { useMemo, useRef } from "react";
import axios from "axios";
import { useAuth } from "@clerk/react";

export const API = `${(process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "")}/api`;

export function useApi() {
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  return useMemo(() => {
    const inst = axios.create({ baseURL: API, timeout: 20000 });
    inst.interceptors.request.use(async (config) => {
      const token = await tokenRef.current();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return inst;
  }, []);
}

export const imgUrl = (v) => {
  if (!v) return "";
  if (v.startsWith("http") || v.startsWith("/")) return v;
  return `${API}/files/${v}`;
};

export const errMsg = (e) => {
  if (!e?.response) return "Não foi possível conectar. Verifique sua internet e tente novamente. Se enviou uma solicitação, confira o resultado antes de repeti-la.";
  if (e.response.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (e.response.status === 429) return "Muitas tentativas em pouco tempo. Aguarde um momento antes de tentar novamente.";
  if (e.response.status >= 500 && typeof e.response.data?.detail !== "string") return "O serviço está temporariamente indisponível. Tente novamente em instantes.";
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return "Verifique os campos preenchidos.";
  return "Algo deu errado. Tente novamente.";
};
