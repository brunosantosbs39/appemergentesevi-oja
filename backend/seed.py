import random
import uuid
from datetime import datetime, timedelta, timezone

PROS = [
    dict(key="carlos", name="Carlos Henrique", cats=["eletricista"], rate=90, city="Pinheiros, São Paulo", lat=-23.5614, lng=-46.6828,
         headline="Eletricista residencial e predial • NR10",
         bio="Há 12 anos fazendo instalações, quadros de distribuição e manutenção elétrica com segurança. Atendo emergências."),
    dict(key="rafael", name="Rafael Souza", cats=["encanador"], rate=80, city="Vila Mariana, São Paulo", lat=-23.5893, lng=-46.6346,
         headline="Encanador • vazamentos, aquecedores e desentupimento",
         bio="Caça-vazamento sem quebradeira, troca de registros, instalação de aquecedores e reparos hidráulicos em geral."),
    dict(key="juliana", name="Juliana Alves", cats=["pintor"], rate=70, city="Moema, São Paulo", lat=-23.6005, lng=-46.6650,
         headline="Pintura residencial, texturas e grafiato",
         bio="Pintura com acabamento caprichado, proteção de móveis e limpeza ao final. Trabalho com tintas laváveis e antimofo."),
    dict(key="marcos", name="Marcos Oliveira", cats=["marceneiro", "montador"], rate=95, city="Mooca, São Paulo", lat=-23.5587, lng=-46.5996,
         headline="Marcenaria sob medida e montagem de móveis",
         bio="Cozinhas planejadas, painéis, guarda-roupas e reparos em madeira. Também monto móveis de loja com agilidade."),
    dict(key="ana", name="Ana Paula Ribeiro", cats=["diarista"], rate=45, city="Santana, São Paulo", lat=-23.5022, lng=-46.6253,
         headline="Diarista e limpeza pós-obra",
         bio="Limpeza completa, organização de armários e limpeza pesada pós-reforma. Levo meus próprios produtos se precisar."),
    dict(key="thiago", name="Thiago Lima", cats=["beleza"], rate=60, city="Butantã, São Paulo", lat=-23.5719, lng=-46.7085,
         headline="Barbeiro • cortes clássicos e degradê em domicílio",
         bio="Atendo em casa ou no escritório com todo o equipamento. Corte, barba e sobrancelha."),
    dict(key="camila", name="Camila Ferreira", cats=["ti_design", "fotografo"], rate=120, city="Bela Vista, São Paulo", lat=-23.5614, lng=-46.6484,
         headline="Designer gráfica e social media para pequenos negócios",
         bio="Identidade visual, posts para redes sociais, cardápios e fotos de produto para quem está começando."),
    dict(key="jose", name="José Pereira", cats=["jardineiro"], rate=55, city="Lapa, São Paulo", lat=-23.5226, lng=-46.7044,
         headline="Jardinagem, paisagismo e poda",
         bio="Manutenção de jardins, poda de árvores e cercas vivas, plantio e projetos de paisagismo para casas e condomínios."),
    dict(key="pedro", name="Pedro Santos", cats=["pedreiro"], rate=85, city="Tatuapé, São Paulo", lat=-23.5400, lng=-46.5760,
         headline="Pedreiro • reformas, pisos e revestimentos",
         bio="Assentamento de porcelanato, reboco, contrapiso, pequenas reformas de banheiro e cozinha."),
]

CLIENTS = [
    dict(key="fernanda", name="Fernanda Costa", avatar="/seed/av-fernanda.jpg", city="Perdizes, São Paulo", lat=-23.5363, lng=-46.6750),
    dict(key="ricardo", name="Ricardo Mendes", avatar=None, city="Itaim Bibi, São Paulo", lat=-23.5846, lng=-46.6797),
]

POSTS = [
    ("carlos", "post-eletrica-1", "Troca completa do quadro de distribuição com disjuntores DR. Segurança em primeiro lugar!", "eletricista", "Pinheiros, SP"),
    ("juliana", "post-pintura-2", "Parede de destaque em amarelo para dar vida à sala. O que acharam?", "pintor", "Moema, SP"),
    ("marcos", "post-marcenaria-1", "Cozinha planejada entregue hoje! Projeto, fabricação e instalação.", "marceneiro", "Mooca, SP"),
    ("ana", "post-limpeza-1", "Limpeza detalhada de cozinha, cada cantinho brilhando.", "diarista", "Santana, SP"),
    ("thiago", "post-barbearia-1", "Atendimento em domicílio: corte + finalização. Agenda aberta essa semana!", "beleza", "Butantã, SP"),
    ("camila", "post-design-1", "Rascunhos da nova identidade visual de uma cafeteria do bairro.", "ti_design", "Bela Vista, SP"),
    ("rafael", "post-hidraulica-1", "Reparo de vazamento embutido sem precisar quebrar o piso inteiro.", "encanador", "Vila Mariana, SP"),
    ("jose", "post-jardim-2", "Manutenção mensal de jardim em condomínio. Flores no lugar certo.", "jardineiro", "Lapa, SP"),
    ("pedro", "post-reforma-1", "Assentamento de porcelanato 60x60 com nivelamento a laser.", "pedreiro", "Tatuapé, SP"),
    ("carlos", "post-eletrica-2", "Organização de fiação em reforma de apartamento.", "eletricista", "Pinheiros, SP"),
    ("juliana", "post-pintura-1", "Pintura de teto e paredes com proteção total dos móveis.", "pintor", "Moema, SP"),
    ("marcos", "post-marcenaria-2", "Cortes de precisão para um painel ripado sob medida.", "marceneiro", "Mooca, SP"),
    ("ana", "post-limpeza-2", "Limpeza pós-obra: piso sem resto de cimento e rejunte.", "diarista", "Santana, SP"),
    ("thiago", "post-barbearia-2", "Degradê navalhado com acabamento na tesoura.", "beleza", "Butantã, SP"),
    ("camila", "post-design-2", "Estação montada para mais um projeto de social media.", "ti_design", "Bela Vista, SP"),
    ("jose", "post-jardim-1", "Projeto de canteiros floridos finalizado.", "jardineiro", "Lapa, SP"),
    ("carlos", "post-eletrica-3", "Mais um dia de instalação com EPI completo.", "eletricista", "Pinheiros, SP"),
]

COMMENTS = [
    "Ficou excelente, parabéns pelo capricho!",
    "Você atende na zona oeste?",
    "Trabalho muito limpo!",
    "Vou te chamar no chat para um orçamento.",
    "Que acabamento bonito!",
]

REVIEWS = [
    "Pontual, educado e deixou tudo limpo. Recomendo muito!",
    "Resolveu rápido e cobrou o combinado.",
    "Excelente profissional, explicou tudo o que estava fazendo.",
    "Trabalho caprichado, com certeza vou chamar de novo.",
    "Muito atencioso e cuidadoso com a casa.",
    "Chegou no horário e o resultado ficou ótimo.",
]

TITLES = {
    "eletricista": ["Troca de chuveiro", "Instalação de luminárias", "Tomadas sem energia"],
    "encanador": ["Vazamento no banheiro", "Troca de registro", "Pia entupida"],
    "pintor": ["Pintura de quarto", "Pintura de sala e corredor"],
    "marceneiro": ["Reparo em porta de armário", "Prateleiras sob medida"],
    "diarista": ["Faxina completa", "Limpeza pós-mudança"],
    "beleza": ["Corte e barba em casa", "Corte masculino"],
    "ti_design": ["Logo para minha loja", "Posts para Instagram"],
    "jardineiro": ["Poda de árvores", "Manutenção do jardim"],
    "pedreiro": ["Troca de piso do banheiro", "Reboco de parede"],
}

OPEN_REQUESTS = [
    ("fernanda", "eletricista", "Tomada soltando faísca na cozinha", "A tomada ao lado da geladeira está fazendo faísca. Preciso de alguém hoje se possível.", 150.0),
    ("ricardo", "pintor", "Pintar quarto de 12 m²", "Paredes brancas, teto também. Já tenho a tinta.", 600.0),
    ("fernanda", "montador", "Montar guarda-roupa 6 portas", "Guarda-roupa novo ainda na caixa.", 250.0),
    ("ricardo", "encanador", "Vazamento embaixo da pia", "Goteira constante no sifão da cozinha.", 200.0),
]


def _iso(dt):
    return dt.isoformat()


async def seed_demo(db):
    if await db.users.find_one({"user_id": "seed_pro_carlos"}):
        return
    rnd = random.Random(7)
    now = datetime.now(timezone.utc)
    base = {"rating_avg": 0.0, "rating_count": 0, "jobs_done": 0, "is_demo": True}
    users = []
    for p in PROS:
        users.append({**base, "user_id": f"seed_pro_{p['key']}", "name": p["name"], "role": "profissional",
                      "avatar": f"/seed/av-{p['key']}.jpg", "headline": p["headline"], "bio": p["bio"],
                      "categories": p["cats"], "city": p["city"], "lat": p["lat"], "lng": p["lng"],
                      "hourly_rate": float(p["rate"]), "created_at": _iso(now - timedelta(days=rnd.randint(60, 400)))})
    for c in CLIENTS:
        users.append({**base, "user_id": f"seed_cli_{c['key']}", "name": c["name"], "role": "contratante",
                      "avatar": c["avatar"], "headline": "", "bio": "", "categories": [], "city": c["city"],
                      "lat": c["lat"], "lng": c["lng"], "hourly_rate": None,
                      "created_at": _iso(now - timedelta(days=rnd.randint(30, 200)))})
    await db.users.insert_many([dict(u) for u in users])
    all_ids = [u["user_id"] for u in users]
    pro_by_key = {p["key"]: p for p in PROS}

    posts, comments = [], []
    for i, (key, img, caption, cat, loc) in enumerate(POSTS):
        pro = pro_by_key[key]
        created = now - timedelta(hours=2 + i * 6 + rnd.randint(0, 4))
        pid = str(uuid.uuid4())
        n_comments = rnd.randint(0, 2) if i < 10 else 0
        for j in range(n_comments):
            comments.append({"id": str(uuid.uuid4()), "post_id": pid,
                             "user_id": rnd.choice([x for x in all_ids if x != f"seed_pro_{key}"]),
                             "text": rnd.choice(COMMENTS), "created_at": _iso(created + timedelta(minutes=20 + j * 15))})
        posts.append({"id": pid, "user_id": f"seed_pro_{key}", "image": f"/seed/{img}.jpg", "caption": caption,
                      "category": cat, "location_name": loc,
                      "lat": pro["lat"] + rnd.uniform(-0.008, 0.008), "lng": pro["lng"] + rnd.uniform(-0.008, 0.008),
                      "likes": rnd.sample(all_ids, rnd.randint(2, 9)), "comments_count": n_comments,
                      "created_at": _iso(created)})
    await db.posts.insert_many(posts)
    if comments:
        await db.comments.insert_many(comments)

    reqs, reviews = [], []
    for p in PROS:
        pro_id = f"seed_pro_{p['key']}"
        ratings = []
        for _ in range(rnd.randint(2, 4)):
            c = rnd.choice(CLIENTS)
            created = now - timedelta(days=rnd.randint(4, 90))
            rating = rnd.choice([5, 5, 5, 4, 5, 4])
            ratings.append(rating)
            rid = str(uuid.uuid4())
            cat = p["cats"][0]
            reqs.append({"id": rid, "client_id": f"seed_cli_{c['key']}", "professional_id": pro_id, "target_pro_id": None,
                         "category": cat, "title": rnd.choice(TITLES.get(cat, ["Serviço"])), "description": "",
                         "budget": float(rnd.choice([120, 180, 250, 350, 480])), "address": c["city"],
                         "lat": c["lat"], "lng": c["lng"], "image": None, "status": "concluido",
                         "client_reviewed": True, "pro_reviewed": True, "created_at": _iso(created),
                         "accepted_at": _iso(created + timedelta(minutes=12)),
                         "completed_at": _iso(created + timedelta(hours=5)), "updated_at": _iso(created + timedelta(hours=5))})
            reviews.append({"id": str(uuid.uuid4()), "request_id": rid, "from_id": f"seed_cli_{c['key']}", "to_id": pro_id,
                            "rating": rating, "comment": rnd.choice(REVIEWS), "category": cat,
                            "created_at": _iso(created + timedelta(days=1))})
        await db.users.update_one({"user_id": pro_id}, {"$set": {
            "rating_avg": round(sum(ratings) / len(ratings), 2), "rating_count": len(ratings), "jobs_done": len(ratings)}})

    for i, (ckey, cat, title, desc, budget) in enumerate(OPEN_REQUESTS):
        c = next(x for x in CLIENTS if x["key"] == ckey)
        created = now - timedelta(minutes=25 + i * 40)
        reqs.append({"id": str(uuid.uuid4()), "client_id": f"seed_cli_{ckey}", "professional_id": None, "target_pro_id": None,
                     "category": cat, "title": title, "description": desc, "budget": budget, "address": c["city"],
                     "lat": c["lat"] + rnd.uniform(-0.004, 0.004), "lng": c["lng"] + rnd.uniform(-0.004, 0.004),
                     "image": None, "status": "pendente", "client_reviewed": False, "pro_reviewed": False,
                     "created_at": _iso(created), "updated_at": _iso(created)})
    await db.requests.insert_many(reqs)
    await db.reviews.insert_many(reviews)
