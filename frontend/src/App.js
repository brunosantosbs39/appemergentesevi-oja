import "@/App.css";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Show } from "@clerk/react";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import { MeProvider } from "@/context/MeContext";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";
import Onboarding from "@/pages/Onboarding";
import WalletPage from "@/pages/WalletPage";
import Companies from "@/pages/Companies";
import Feed from "@/pages/Feed";
import MapPage from "@/pages/MapPage";
import Requests from "@/pages/Requests";
import Chat from "@/pages/Chat";
import Profile from "@/pages/Profile";

const Home = () => (
  <>
    <Show when="signed-in"><Navigate to="/feed" replace /></Show>
    <Show when="signed-out"><Landing /></Show>
  </>
);

const Protected = () => (
  <>
    <Show when="signed-in"><MeProvider><Outlet /></MeProvider></Show>
    <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
  </>
);

function App() {
  return (
    <BrowserRouter>
      <ClerkAuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
          <Route element={<Protected />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppShell />}>
              <Route path="/feed" element={<Feed />} />
              <Route path="/empresas" element={<Companies />} />
              <Route path="/mapa" element={<MapPage />} />
              <Route path="/carteira" element={<WalletPage />} />
              <Route path="/pedidos" element={<Requests />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:id" element={<Chat />} />
              <Route path="/perfil/:id" element={<Profile />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-center" />
      </ClerkAuthProvider>
    </BrowserRouter>
  );
}

export default App;

