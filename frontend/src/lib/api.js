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
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return "Verifique os campos preenchidos.";
  return "Algo deu errado. Tente novamente.";
};
