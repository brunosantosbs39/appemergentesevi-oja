import { Component } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SignIn, SignUp } from "@clerk/react";
import { Logo } from "@/components/common/Misc";
import "./AuthPages.css";

const benefits = [
  { icon: MapPin, title: "Oportunidades perto de você", text: "Encontre pedidos por categoria e localização." },
  { icon: BriefcaseBusiness, title: "Contrate ou ofereça seu trabalho", text: "Uma única conta para as duas possibilidades." },
  { icon: MessageCircle, title: "Combine os detalhes pelo chat", text: "Converse sobre o serviço antes de fechar." },
];

class AccessBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="auth-access-error">
      <h2>Não foi possível carregar o acesso.</h2>
      <p>Confira sua conexão e tente novamente.</p>
      <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
    </div>;
    return this.props.children;
  }
}

const AccessHelp = () => (
  <section className="auth-help" aria-label="Ajuda para acessar sua conta">
    <details>
      <summary>Precisa de ajuda para entrar?</summary>
      <div>
        <p><strong>Esqueceu a senha?</strong> Informe seu e-mail e continue. Se o acesso solicitar uma senha, use a opção de recuperação no formulário.</p>
        <p><strong>O código não chegou?</strong> Confira o endereço informado e a pasta de spam. Solicite um novo código quando a opção aparecer.</p>
        <p><strong>Entrou com Google antes?</strong> Use o mesmo método e a mesma conta quando essa opção estiver disponível.</p>
      </div>
    </details>
    <details>
      <summary>Preciso de duas contas para contratar e trabalhar?</summary>
      <div><p>Não. Com a mesma conta você pode publicar pedidos, se candidatar a oportunidades e gerenciar seus serviços.</p></div>
    </details>
  </section>
);

const AuthLayout = ({ children, registering = false }) => (
  <div className="auth-page">
    <a className="auth-skip" href="#acesso">Ir para o formulário de acesso</a>
    <header className="auth-topbar">
      <Logo />
      <div className="auth-top-actions">
        <Link to="/" className="auth-home" aria-label="Página inicial"><ArrowLeft size={16} aria-hidden="true" /><span>Página inicial</span></Link>
        <ThemeToggle compact />
      </div>
    </header>
    <div className="auth-layout">
      <aside className="auth-story">
        <img src="/seed/post-marcenaria-1.jpg" alt="" className="auth-story-photo" />
        <div className="auth-story-shade" />
        <div className="auth-story-content">
          <p className="auth-eyebrow">Talento encontra oportunidade</p>
          <h2>Quem faz.<br />Quem precisa.<br /><span>No mesmo lugar.</span></h2>
          <p className="auth-story-intro">Do primeiro contato ao próximo serviço. Conecte seu trabalho às pessoas da sua região.</p>
          <div className="auth-benefits">
            {benefits.map(({icon: Icon, title, text}, index) => <div className="auth-benefit" key={title}>
              <span className="auth-benefit-number">0{index + 1}</span>
              <div><h3><Icon size={17} aria-hidden="true" />{title}</h3><p>{text}</p></div>
            </div>)}
          </div>
        </div>
        <p className="auth-story-bottom">SERVIÇOJÁ <span>Conexões que viram trabalho.</span><ArrowUpRight size={18} aria-hidden="true" /></p>
      </aside>
      <main className="auth-main" id="acesso">
        <div className="auth-access">
          <p className="auth-eyebrow">{registering ? "Seu próximo passo" : "Bem-vindo de volta"}</p>
          <h1>{registering ? "Comece sua história." : "Seu espaço no ServiçoJá."}</h1>
          <p className="auth-intro">{registering ? "Crie seu acesso. Depois, complete seu perfil e descubra as oportunidades." : "Acesse seus pedidos, conversas e oportunidades em um só lugar."}</p>
          <nav className="auth-tabs" aria-label="Opções de acesso">
            <Link to="/sign-in" aria-current={!registering ? "page" : undefined}>Entrar</Link>
            <Link to="/sign-up" aria-current={registering ? "page" : undefined}>Criar conta</Link>
          </nav>
          <div className="auth-widget"><AccessBoundary key={registering ? "signup" : "signin"}>{children}</AccessBoundary></div>
          <p className="auth-account-note"><ShieldCheck size={18} aria-hidden="true" /><span>Uma conta para contratar e trabalhar. Seus dados de acesso são pessoais.</span></p>
          <AccessHelp />
          <footer className="auth-footer"><Link to="/">Conhecer o ServiçoJá <ArrowUpRight size={14} aria-hidden="true" /></Link></footer>
        </div>
      </main>
    </div>
  </div>
);

export const SignInPage = () => (
  <AuthLayout><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /></AuthLayout>
);

export const SignUpPage = () => (
  <AuthLayout registering><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></AuthLayout>
);
