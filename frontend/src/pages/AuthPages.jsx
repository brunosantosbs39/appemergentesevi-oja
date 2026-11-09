import { useState } from "react";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, useSignIn, useSignUp, SignIn, SignUp, AuthenticateWithRedirectCallback, RedirectToTasks } from "@clerk/react";
import { Eye, EyeOff } from "lucide-react";
import { Logo } from "@/components/common/Misc";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import "./AuthPages.css";

export const AuthLayout = ({ title, subtitle, children }) => <div className="access-page">
  <header><Logo /><ThemeToggle compact /></header>
  <main className="access-card"><h1>{title}</h1><p className="access-subtitle">{subtitle}</p>{children}</main>
  <footer><Link to="/">Voltar à página inicial</Link></footer>
</div>;

function PasswordField({ id = "password", label = "Senha", creating = false }) {
  const [visible, setVisible] = useState(false);
  return <label className="access-field" htmlFor={id}>{label}<span className="access-password">
    <input id={id} name={id} type={visible ? "text" : "password"} autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 8 : undefined} maxLength={256} />
    <button type="button" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
  </span></label>;
}
const message = (error) => {
  const code = error?.errors?.[0]?.code || error?.code || "";
  if (/password_incorrect|identifier_not_found/.test(code)) return "Não foi possível entrar. Confira o e-mail e a senha.";
  if (/password_pwned|password_not_strong/.test(code)) return "Escolha uma senha mais forte que você não use em outros serviços.";
  if (/identifier_exists/.test(code)) return "Este e-mail já possui uma conta. Entre ou recupere sua senha.";
  if (/verification_failed|code_expired|incorrect_code/.test(code)) return "Código inválido ou expirado. Confira ou solicite outro.";
  if (/too_many|rate_limit/.test(code)) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  return error?.longMessage || error?.errors?.[0]?.longMessage || error?.message || "Não foi possível continuar. Tente novamente.";
};
const checked = async (promise) => { const result = await promise; if(result?.error) throw result.error; return result; };

function AccessForm({ registering = false }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [verify, setVerify] = useState(false), [tasks, setTasks] = useState(false);
  const [extra, setExtra] = useState(false);
  const resource = registering ? signUp : signIn;
  const run = async (action) => { if(busy)return; setBusy(true);setError("");try{await action();}catch(e){setError(message(e));}finally{setBusy(false);} };
  const finish = async () => checked(resource.finalize({navigate: ({session, decorateUrl}) => {
    if(session?.currentTask) {setTasks(true);return;}
    const destination = decorateUrl ? decorateUrl("/onboarding") : "/onboarding";
    if(destination.startsWith("http")) window.location.assign(destination);
    else navigate(destination, {replace:true});
  }}));
  const submit = e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if(registering && data.get("password") !== data.get("confirmation")) {setError("As senhas precisam ser iguais.");return;}
    run(async () => {
      await checked(resource.password({emailAddress:String(data.get("email")).trim(),password:String(data.get("password"))}));
      if(resource.status === "complete") return finish();
      if(registering) {
        if(resource.missingFields?.length) {setExtra(true);return;}
        setVerify(true);
        await checked(signUp.verifications.sendEmailCode());
      } else {
        // Clerk's native challenge handles MFA, device trust and password resets.
        setExtra(true);
      }
    });
  };
  if(tasks) return <RedirectToTasks />;
  if(isSignedIn) return <Navigate to="/onboarding" replace />;
  const isContinuation = location.pathname.replace(/\/$/, "") !== (registering ? "/sign-up" : "/sign-in");
  const activeChallenge = ["needs_second_factor", "needs_new_password", "needs_client_trust", "needs_first_factor"].includes(signIn?.status);
  const native = extra || (isContinuation && (registering || activeChallenge));
  return <AuthLayout title={registering ? "Criar sua conta" : "Entrar no ServiçoJá"} subtitle={registering ? "Etapa 1 de 2 · Crie seu acesso. Depois, complete seus dados e endereço." : "Use seu e-mail e senha ou continue com o Google."}>
    {native ? <>{registering ? <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/onboarding" /> : <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/onboarding" />}<Link className="access-link" to={registering?"/sign-up":"/sign-in"} onClick={()=>setExtra(false)}>Voltar</Link></> :
    (verify || (registering && signUp?.status === "missing_requirements" && !signUp.missingFields?.length && signUp.unverifiedFields?.includes("email_address"))) ? <><form onSubmit={e=>{e.preventDefault();const code=new FormData(e.currentTarget).get("code");run(async()=>{await checked(signUp.verifications.verifyEmailCode({code:String(code)}));if(signUp.status==="complete")await finish();else setExtra(true);});}}>
      <label className="access-field" htmlFor="code">Código enviado ao seu e-mail<input id="code" name="code" autoComplete="one-time-code" inputMode="numeric" required /></label>
      <button className="access-primary" disabled={busy}>{busy?"Verificando…":"Verificar e completar cadastro"}</button>
    </form><button className="access-link" disabled={busy} onClick={()=>run(()=>checked(signUp.verifications.sendEmailCode()))}>Reenviar código</button></> :
    <>
      <form onSubmit={submit}>
        <label className="access-field" htmlFor="email">E-mail<input id="email" name="email" type="email" autoComplete={registering ? "email" : "username"} required maxLength={254} placeholder="voce@exemplo.com" /></label>
        <PasswordField creating={registering} />
        {registering && <><PasswordField id="confirmation" label="Confirmar senha" creating /><p className="access-hint">Use pelo menos 8 caracteres e uma senha exclusiva.</p></>}
        {!registering && <Link className="access-link" to="/sign-in/recover">Esqueci minha senha</Link>}
        <div id="clerk-captcha" />
        <button className="access-primary" disabled={!isLoaded || !resource || busy}>{busy?"Aguarde…":registering?"Criar acesso e continuar":"Entrar"}</button>
      </form>
      <div className="access-divider">ou</div>
      <button className="access-google" disabled={!isLoaded || busy || !resource} onClick={()=>run(()=>checked(resource.sso({strategy:"oauth_google",redirectUrl:"/onboarding",redirectCallbackUrl:"/sso-callback"})))}><span aria-hidden="true">G</span> Continuar com Google</button>
      <p className="access-switch">{registering?"Já tem uma conta?":"Ainda não tem conta?"} <Link to={registering?"/sign-in":"/sign-up"}>{registering?"Entrar":"Criar conta"}</Link></p>
      <p className="access-hint">Uma conta para contratar e trabalhar. O endereço é obrigatório para concluir o cadastro, inclusive com Google.</p>
    </>}
    {error && <p role="alert" className="access-error">{error}</p>}
  </AuthLayout>;
}
function RecoverPassword() {
  const {signIn} = useSignIn();
  const {isSignedIn} = useAuth();
  const navigate = useNavigate();
  const [stage,setStage] = useState("email"), [error,setError] = useState(""), [busy,setBusy] = useState(false), [task,setTask] = useState(false);
  const submit = async e => {
    e.preventDefault(); if(busy)return;
    const data = new FormData(e.currentTarget);
    if(stage==="password" && data.get("password")!==data.get("confirmation")){setError("As senhas precisam ser iguais.");return;}
    setBusy(true);setError("");
    try {
      if(stage==="email"){
        await checked(signIn.create({identifier:String(data.get("email")).trim()}));
        await checked(signIn.resetPasswordEmailCode.sendCode());setStage("code");
      }else if(stage==="code"){
        await checked(signIn.resetPasswordEmailCode.verifyCode({code:String(data.get("code"))}));setStage("password");
      }else{
        await checked(signIn.resetPasswordEmailCode.submitPassword({password:String(data.get("password")),signOutOfOtherSessions:true}));
        if(signIn.status==="complete") await checked(signIn.finalize({navigate:({session,decorateUrl})=>{
          if(session?.currentTask){setTask(true);return;}
          const to=decorateUrl?decorateUrl("/onboarding"):"/onboarding";
          if(to.startsWith("http"))window.location.assign(to);else navigate(to,{replace:true});
        }}));
        else setStage("challenge");
      }
    }catch(e){setError(message(e));}finally{setBusy(false);}
  };
  if(task)return <RedirectToTasks />;
  if(isSignedIn)return <Navigate to="/onboarding" replace />;
  return <AuthLayout title="Recuperar senha" subtitle="Confirme seu e-mail para criar uma nova senha. Se você usa Google, também pode voltar e entrar por ele.">
    {stage==="challenge"?<SignIn routing="hash" forceRedirectUrl="/onboarding" />:<form onSubmit={submit}>
      {stage==="email" && <label className="access-field" htmlFor="recovery-email">E-mail da conta<input id="recovery-email" name="email" type="email" autoComplete="email" required /></label>}
      {stage==="code" && <label className="access-field" htmlFor="recovery-code">Código enviado ao e-mail<input id="recovery-code" name="code" autoComplete="one-time-code" inputMode="numeric" required /></label>}
      {stage==="password" && <><PasswordField label="Nova senha" creating /><PasswordField id="confirmation" label="Confirmar nova senha" creating /><p className="access-hint">Ao redefinir a senha, as outras sessões da conta serão encerradas.</p></>}
      <button className="access-primary" disabled={busy || !signIn}>{busy?"Aguarde…":stage==="email"?"Enviar código":stage==="code"?"Verificar código":"Salvar nova senha"}</button>
    </form>}
    {stage==="code" && <button className="access-link" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await checked(signIn.resetPasswordEmailCode.sendCode());}catch(e){setError(message(e));}finally{setBusy(false);}}}>Reenviar código</button>}
    {error && <p role="alert" className="access-error">{error}</p>}
    <Link className="access-link" to="/sign-in">Voltar ao login</Link>
  </AuthLayout>;
}
export const SignInPage = () => {
  const {pathname}=useLocation();
  return pathname==="/sign-in/recover" ? <RecoverPassword /> : <AccessForm key="signin" />;
};
export const SignUpPage = () => <AccessForm registering key="signup" />;
export const SsoCallback = () => <AuthLayout title="Concluindo seu acesso" subtitle="Aguarde enquanto confirmamos sua conta."><AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/onboarding" signUpFallbackRedirectUrl="/onboarding" signInUrl="/sign-in/continue" signUpUrl="/sign-up/continue" /></AuthLayout>;
