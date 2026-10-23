import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import "./Landing.css";
const steps = [
 ["01", "Seu pedido.", "Diga o que precisa, onde e quanto pretende pagar."],
 ["02", "O profissional certo.", "Profissionais próximos encontram seu pedido e podem aceitar o serviço."],
 ["03", "Cada detalhe resolvido.", "Converse pelo chat, acompanhe o trabalho e avalie a experiência."],
];
export default function Landing() {
 return <div className="lux-landing" data-testid="landing-page">
  <a className="lux-skip" href="#conteudo">Ir para o conteúdo</a>
  <header className="lux-header"><Link to="/" className="lux-logo" aria-label="ServiçoJá — início">SERVIÇOJÁ<span>PROFISSIONAIS. PERTO DE VOCÊ.</span></Link><nav aria-label="Navegação principal"><Link to="/sign-in" data-testid="landing-signin-link">Entrar</Link><Link to="/sign-up" className="lux-nav-cta" data-testid="landing-signup-link">Criar conta <ArrowRight size={14}/></Link></nav></header>
  <main id="conteudo">
   <section className="lux-hero" aria-labelledby="hero-title"><img className="lux-hero-photo" src="/seed/post-eletrica-1.jpg" alt="Eletricista executando um serviço com atenção aos detalhes" fetchPriority="high"/><div className="lux-hero-shade"/><div className="lux-hero-copy"><p className="lux-eyebrow">QUALIFICAÇÃO ENCONTRA PROXIMIDADE</p><h1 id="hero-title">O cuidado está<br/>nos detalhes.</h1><p className="lux-intro">Profissionais para transformar o que você precisa<br className="lux-desktop-break"/> no serviço bem-feito que você espera.</p><div className="lux-actions"><Link className="lux-button lux-button-white" to="/sign-up" data-testid="landing-cta-hire">Quero contratar <ArrowRight size={18}/></Link><Link className="lux-button lux-button-outline" to="/sign-up" data-testid="landing-cta-pro">Sou profissional <ArrowRight size={18}/></Link></div></div><div className="lux-hero-bottom"><span>TRABALHO DE VERDADE. CONEXÕES REAIS.</span><a href="#como-funciona">EXPLORE <ArrowDown size={16}/></a></div></section>
   <section className="lux-categories" aria-label="Especialidades"><span>ELÉTRICA</span><span>REFORMAS</span><span>MARCENARIA</span><span>LIMPEZA</span><span>DESIGN</span><span>E MUITO MAIS</span></section>
   <section className="lux-section" id="como-funciona"><div className="lux-section-heading"><p className="lux-eyebrow">01 / COMO FUNCIONA</p><h2>Uma conexão.<br/>Novas possibilidades.</h2></div><div className="lux-steps">{steps.map(([n,title,description])=><article key={n}><span className="lux-step-number">{n}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
   <section className="lux-craft" aria-labelledby="craft-title"><div className="lux-craft-image"><img src="/seed/post-marcenaria-1.jpg" alt="Trabalho de marcenaria em destaque" loading="lazy"/></div><div className="lux-craft-copy"><p className="lux-eyebrow">02 / FEITO POR QUEM ENTENDE</p><h2 id="craft-title">O trabalho<br/>fala por si.</h2><p>Conheça o portfólio de quem faz. Fotos dos serviços, localização e avaliações ajudam você a encontrar o profissional para o seu próximo projeto.</p><Link className="lux-text-link" to="/sign-up">Explore os profissionais <ArrowRight size={20}/></Link></div></section>
   <section className="lux-final lux-section"><p className="lux-eyebrow">SEU PRÓXIMO PROJETO COMEÇA AQUI</p><h2>Vamos fazer<br/>acontecer.</h2><div className="lux-actions"><Link className="lux-button lux-button-white" to="/sign-up" data-testid="landing-final-cta">Criar conta grátis <ArrowRight size={18}/></Link><Link className="lux-text-link" to="/sign-in" data-testid="landing-final-signin">Já tenho conta <ArrowRight size={18}/></Link></div></section>
  </main><footer className="lux-footer"><Link to="/" className="lux-logo">SERVIÇOJÁ</Link><p>© {new Date().getFullYear()} ServiçoJá</p><span>CONEXÕES QUE FAZEM A DIFERENÇA.</span></footer>
 </div>;
}
