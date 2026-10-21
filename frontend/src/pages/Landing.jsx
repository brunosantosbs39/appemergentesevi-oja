import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, CheckCircle2, Heart, MapPin, MessageCircle, Radar, Star } from "lucide-react";
import { Logo } from "@/components/common/Misc";
import { CATEGORIES } from "@/lib/constants";

const TopBar = () => (
  <header className="absolute inset-x-0 top-0 z-20">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <Logo dark />
      <div className="flex items-center gap-1 sm:gap-2">
        <Link to="/sign-in" data-testid="landing-signin-link" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:text-white">
          Entrar
        </Link>
        <Link to="/sign-up" data-testid="landing-signup-link" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-50">
          Criar conta
        </Link>
      </div>
    </div>
  </header>
);

const HeroVisual = () => (
  <div className="relative mx-auto h-[440px] w-full max-w-md lg:h-[540px]">
    <div className="absolute right-0 top-0 h-[80%] w-[80%] animate-fade-up overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
      <img src="/seed/post-eletrica-1.jpg" alt="Eletricista trabalhando" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-xl">
        <img src="/seed/av-carlos.jpg" alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-emerald-400" />
        <div className="text-white">
          <p className="flex items-center gap-1 text-sm font-bold">Carlos Henrique <BadgeCheck className="h-4 w-4 text-emerald-400" /></p>
          <p className="text-xs text-slate-200">Eletricista • 1,2 km</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-amber-300">
          <Star className="h-3.5 w-3.5 fill-amber-300" /> 4,8
        </span>
      </div>
    </div>
    <div className="absolute bottom-0 left-0 w-[64%] animate-fade-up rounded-3xl bg-white p-4 shadow-2xl [animation-delay:250ms]">
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blue-800">Aceito</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">agora</span>
      </div>
      <p className="mt-2 font-heading text-base font-bold text-slate-900">Troca de chuveiro</p>
      <p className="text-xs text-slate-500">Perdizes • R$ 150,00</p>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 p-2 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Profissional a caminho
      </div>
    </div>
    <div className="absolute left-4 top-10 flex animate-float items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-xl">
      <Radar className="h-4 w-4" /> Profissionais perto de você
    </div>
  </div>
);

const Hero = () => (
  <section className="grain relative overflow-hidden bg-slate-950 pb-20 pt-32 lg:pb-28 lg:pt-40">
    <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
    <div className="pointer-events-none absolute -right-40 top-20 h-[480px] w-[480px] rounded-full bg-emerald-500/20 blur-[120px]" />
    <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="animate-fade-up">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-emerald-300">
          <span className="radar-dot" /> Mão de obra qualificada • perto de você
        </p>
        <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
          Chame um profissional <span className="text-emerald-400">como quem chama um carro.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
          Eletricistas, encanadores, diaristas, designers e qualquer autônomo — com portfólio no feed, localização no mapa, chat direto e avaliações reais.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link to="/sign-up" data-testid="landing-cta-hire" className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-4 text-base font-bold text-white shadow-[0_12px_40px_-12px_rgba(16,185,129,0.9)] transition-colors hover:bg-emerald-400">
            Quero contratar <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link to="/sign-up" data-testid="landing-cta-pro" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-4 text-base font-bold text-white transition-colors hover:bg-white/10">
            Sou profissional
          </Link>
        </div>
      </div>
      <HeroVisual />
    </div>
  </section>
);

const Marquee = () => {
  const items = [...CATEGORIES, ...CATEGORIES];
  return (
    <div className="overflow-hidden border-y border-slate-200 bg-white py-5">
      <div className="flex w-max animate-marquee gap-3">
        {items.map(({ slug, label, icon: Icon }, i) => (
          <span key={`${slug}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-700">
            <Icon className="h-4 w-4 text-emerald-600" /> {label}
          </span>
        ))}
      </div>
    </div>
  );
};

const STEPS = [
  { n: "01", icon: MapPin, title: "Publique seu pedido", text: "Diga o que precisa, onde e quanto pretende pagar. Leva menos de um minuto." },
  { n: "02", icon: Radar, title: "Profissionais próximos aceitam", text: "Seu pedido aparece no radar de quem está por perto. O primeiro que aceitar fica com o serviço." },
  { n: "03", icon: MessageCircle, title: "Converse, conclua e avalie", text: "Combine os detalhes no chat, acompanhe o status e avalie com estrelas no final." },
];

const HowItWorks = () => (
  <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
    <p className="font-mono text-xs uppercase tracking-widest text-emerald-700">Como funciona</p>
    <h2 className="mt-2 max-w-2xl font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Do pedido ao serviço feito, sem complicação.</h2>
    <div className="mt-14 grid gap-6 md:grid-cols-3">
      {STEPS.map(({ n, icon: Icon, title, text }, i) => (
        <div key={n} className={`rounded-3xl border border-slate-200 bg-white p-7 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-xl ${i === 1 ? "md:translate-y-8" : ""}`}>
          <div className="flex items-center justify-between">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-emerald-400"><Icon className="h-5 w-5" /></span>
            <span className="font-mono text-3xl font-medium text-slate-200">{n}</span>
          </div>
          <h3 className="mt-6 font-heading text-xl font-bold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
        </div>
      ))}
    </div>
  </section>
);

const FEED_IMGS = ["post-marcenaria-1", "post-pintura-2", "post-barbearia-1", "post-jardim-2", "post-design-1", "post-reforma-1"];

const FeedShowcase = () => (
  <section className="bg-slate-950 py-24">
    <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
      <div className="grid grid-cols-3 gap-3">
        {FEED_IMGS.map((img, i) => (
          <div key={img} className={`relative aspect-square overflow-hidden rounded-2xl ${i % 2 ? "translate-y-6" : ""}`}>
            <img src={`/seed/${img}.jpg`} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-110" />
          </div>
        ))}
      </div>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Feed de trabalhos</p>
        <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Seu portfólio vira vitrine.</h2>
        <p className="mt-4 max-w-lg text-slate-300">
          Profissionais publicam fotos dos serviços com localização, como numa rede social. Clientes curtem, comentam e contratam direto pela postagem.
        </p>
        <ul className="mt-8 space-y-3 text-slate-200">
          {[[Heart, "Curtidas e comentários em tempo real"], [MapPin, "Cada postagem com local no mapa"], [Star, "Avaliações que constroem reputação"]].map(([Icon, t]) => (
            <li key={t} className="flex items-center gap-3"><Icon className="h-5 w-5 text-emerald-400" /> {t}</li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

const FinalCta = () => (
  <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
    <div className="relative overflow-hidden rounded-[2.5rem] bg-emerald-600 px-8 py-16 sm:px-14">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/40 blur-3xl" />
      <h2 className="relative max-w-2xl font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Pronto para resolver aquele serviço que está esperando?</h2>
      <div className="relative mt-8 flex flex-wrap gap-3">
        <Link to="/sign-up" data-testid="landing-final-cta" className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-7 py-4 font-bold text-white transition-colors hover:bg-slate-800">
          Criar conta grátis <ArrowRight className="h-5 w-5" />
        </Link>
        <Link to="/sign-in" className="inline-flex items-center rounded-full border border-white/40 px-7 py-4 font-bold text-white transition-colors hover:bg-white/10" data-testid="landing-final-signin">
          Já tenho conta
        </Link>
      </div>
    </div>
    <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
      <Logo />
      <p>© {new Date().getFullYear()} ServiçoJá. Todos os direitos reservados.</p>
    </footer>
  </section>
);

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]" data-testid="landing-page">
      <TopBar />
      <Hero />
      <Marquee />
      <HowItWorks />
      <FeedShowcase />
      <FinalCta />
    </div>
  );
}
