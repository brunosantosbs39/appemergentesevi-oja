import { SignIn, SignUp } from "@clerk/react";
import { Logo } from "@/components/common/Misc";

const AuthLayout = ({ children, title }) => (
  <div className="grid min-h-screen bg-[#F8FAFC] lg:grid-cols-2">
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 lg:flex">
      <img src="/seed/post-marcenaria-1.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/20" />
      <div className="relative"><Logo dark /></div>
      <div className="relative">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-300">ServiçoJá</p>
        <h2 className="mt-3 max-w-md font-heading text-4xl font-extrabold leading-tight tracking-tight text-white">{title}</h2>
        <p className="mt-4 max-w-md text-slate-300">Profissionais autônomos e contratantes conectados por localização, feed e chat.</p>
      </div>
    </aside>
    <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
      <div className="mb-8 lg:hidden"><Logo /></div>
      {children}
    </main>
  </div>
);

export const SignInPage = () => (
  <AuthLayout title="Bom te ver de novo. Tem serviço esperando por você.">
    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp />
  </AuthLayout>
);

export const SignUpPage = () => (
  <AuthLayout title="Crie sua conta e escolha: contratar ou trabalhar.">
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
  </AuthLayout>
);
