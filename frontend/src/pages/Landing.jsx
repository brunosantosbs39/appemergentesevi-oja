import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import "./Landing.css";
const resources = [
 ["UMA CONTA, DUAS POSSIBILIDADES", "Contrate e ofereça serviços", "Use o mesmo perfil para publicar pedidos e se candidatar a oportunidades. Complete seu cadastro e escolha suas áreas de atuação."],
 ["OPORTUNIDADES PERTO DE VOCÊ", "Feed, mapa e alertas", "Encontre pedidos no feed e no mapa, filtre por categoria e distância e receba avisos de oportunidades compatíveis com sua área e proximidade. A localização pública dos profissionais é aproximada."],
 ["COMBINE DO SEU JEITO", "Diária, hora ou orçamento", "Informe a forma de contratação no pedido e combine valores, prazos e detalhes pelo chat, com mensagens, áudios e contrapropostas."],
 ["DA CASA AO PALCO", "Diversas especialidades", "Encontre profissionais de reformas, limpeza, tecnologia, beleza e muito mais. Para shows e eventos, há produção, som, iluminação, palco, DJs, músicos e equipes de apoio."],
 ["CADA UNIDADE ORGANIZADA", "Empresas e filiais", "Cadastre empresas e filiais, vincule pedidos à unidade correspondente e acompanhe os custos. Registre também diárias manualmente, separando valores previstos, concluídos e pagos."],
 ["SEU TRABALHO EM DESTAQUE", "Perfil e portfólio", "Apresente suas especialidades, publique trabalhos e consulte avaliações. Acompanhe candidaturas e o andamento dos serviços em um só lugar."],
];
const questions = [
 ["Preciso de duas contas?", "Não. A mesma conta permite contratar e trabalhar. Tanto no cadastro por e-mail quanto pelo Google, você precisa completar suas informações e endereço para começar."],
 ["Quem escolhe o profissional?", "O contratante. Os interessados se candidatam, e quem publicou o pedido analisa os perfis e seleciona o profissional. A candidatura não significa contratação automática."],
 ["Como a localização funciona?", "O endereço do cadastro ajuda a definir sua região inicial. Você pode usar Minha localização, com a permissão do dispositivo, e filtrar oportunidades por distância. A precisão depende do aparelho; as distâncias são em linha reta."],
 ["Como funciona a carteira?", "Quando disponível na sua conta, o depósito Pix apresenta QR Code e código Copia e Cola. O saldo só é creditado após a confirmação do pagamento. Confira na carteira as condições e os recursos habilitados. Você pode solicitar saque do saldo disponível para uma chave Pix aleatória."],
 ["O painel de empresas faz pagamentos?", "O painel organiza os custos dos pedidos e dos lançamentos manuais por empresa ou filial. Marcar um lançamento como pago é um registro de controle e não transfere dinheiro."],
 ["As conversas são protegidas?", "Mensagens e áudios enviados com a proteção do chat ativada usam criptografia de ponta a ponta. Contrapropostas são processadas pelo sistema, e mensagens antigas podem ser anteriores à proteção. O chat identifica essas situações."],
];
const steps = [
 ["01", "Seu pedido.", "Diga o que precisa, onde e quanto pretende pagar."],
 ["02", "O profissional certo.", "Profissionais se candidatam ao pedido. Você compara os perfis e escolhe quem contratar."],
 ["03", "Cada detalhe resolvido.", "Converse pelo chat, acompanhe o trabalho e avalie a experiência."],
];
export default function Landing() {
 return <div className="lux-landing" data-testid="landing-page">
  <a className="lux-skip" href="#conteudo">Ir para o conteúdo</a>
  <header className="lux-header"><Link to="/" className="lux-logo" aria-label="ServiçoJá — início">SERVIÇOJÁ<span>PROFISSIONAIS. PERTO DE VOCÊ.</span></Link><nav aria-label="Navegação principal"><Link to="/sign-in" data-testid="landing-signin-link">Entrar</Link><Link to="/sign-up" className="lux-nav-cta" data-testid="landing-signup-link">Criar conta <ArrowRight size={14}/></Link></nav></header>
  <main id="conteudo">
   <section className="lux-hero" aria-labelledby="hero-title"><img className="lux-hero-photo" src="/seed/post-eletrica-1.jpg" alt="Eletricista executando um serviço com atenção aos detalhes" fetchPriority="high"/><div className="lux-hero-shade"/><div className="lux-hero-copy"><p className="lux-eyebrow">QUALIFICAÇÃO ENCONTRA PROXIMIDADE</p><h1 id="hero-title">O cuidado está<br/>nos detalhes.</h1><p className="lux-intro">Profissionais para transformar o que você precisa<br className="lux-desktop-break"/> no serviço bem-feito que você espera.</p><div className="lux-actions"><Link className="lux-button lux-button-white" to="/sign-up" data-testid="landing-cta-hire">Quero contratar <ArrowRight size={18}/></Link><Link className="lux-button lux-button-outline" to="/sign-up" data-testid="landing-cta-pro">Sou profissional <ArrowRight size={18}/></Link></div></div><div className="lux-hero-bottom"><span>TRABALHO DE VERDADE. CONEXÕES REAIS.</span><a href="#como-funciona">EXPLORE <ArrowDown size={16}/></a></div></section>
   <section className="lux-categories" aria-label="Especialidades"><span>ELÉTRICA</span><span>REFORMAS</span><span>MARCENARIA</span><span>LIMPEZA</span><span>DESIGN</span><span>SHOWS E EVENTOS</span><span>E MUITO MAIS</span></section>
   <section className="lux-section" id="como-funciona"><div className="lux-section-heading"><p className="lux-eyebrow">01 / COMO FUNCIONA</p><h2>Uma conexão.<br/>Novas possibilidades.</h2></div><div className="lux-steps">{steps.map(([n,title,description])=><article key={n}><span className="lux-step-number">{n}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
   <section className="lux-craft" aria-labelledby="craft-title"><div className="lux-craft-image"><img src="/seed/post-marcenaria-1.jpg" alt="Trabalho de marcenaria em destaque" loading="lazy"/></div><div className="lux-craft-copy"><p className="lux-eyebrow">02 / FEITO POR QUEM ENTENDE</p><h2 id="craft-title">O trabalho<br/>fala por si.</h2><p>Conheça o portfólio de quem faz. Fotos dos serviços, localização e avaliações ajudam você a encontrar o profissional para o seu próximo projeto.</p><Link className="lux-text-link" to="/sign-up">Explore os profissionais <ArrowRight size={20}/></Link></div></section>
   <section className="lux-section" id="recursos" aria-labelledby="resources-title"><div className="lux-section-heading"><p className="lux-eyebrow">03 / NO SEU DIA A DIA</p><h2 id="resources-title">Tudo para conectar<br/>trabalho e oportunidade.</h2></div><div className="lux-resources">{resources.map(([label,title,description])=><article key={title}><p className="lux-eyebrow">{label}</p><h3>{title}</h3><p>{description}</p></article>)}</div></section>
   <section className="lux-section lux-faq" id="duvidas" aria-labelledby="faq-title"><div className="lux-section-heading"><p className="lux-eyebrow">04 / SAIBA MAIS</p><h2 id="faq-title">Antes de começar.</h2></div><div className="lux-questions">{questions.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
   <section className="lux-final lux-section"><p className="lux-eyebrow">SEU PRÓXIMO PROJETO COMEÇA AQUI</p><h2>Vamos fazer<br/>acontecer.</h2><div className="lux-actions"><Link className="lux-button lux-button-white" to="/sign-up" data-testid="landing-final-cta">Criar conta grátis <ArrowRight size={18}/></Link><Link className="lux-text-link" to="/sign-in" data-testid="landing-final-signin">Já tenho conta <ArrowRight size={18}/></Link></div></section>
  </main><footer className="lux-footer"><Link to="/" className="lux-logo">SERVIÇOJÁ</Link><nav aria-label="Sobre o ServiçoJá"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#duvidas">Dúvidas</a></nav><p>© {new Date().getFullYear()} ServiçoJá</p><span>CONEXÕES QUE FAZEM A DIFERENÇA.</span></footer>
 </div>;
}
