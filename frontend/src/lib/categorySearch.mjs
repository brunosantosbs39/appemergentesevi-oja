const AREAS = {
  eletricista: "eletrica eletricidade instalacao construcao manutencao",
  encanador: "hidraulica vazamento tubulacao construcao manutencao",
  pintor: "pintura construcao reforma",
  pedreiro: "obra alvenaria construcao reforma",
  marceneiro: "madeira moveis marcenaria",
  diarista: "limpeza faxina domestica",
  jardineiro: "jardim jardinagem paisagismo",
  beleza: "cabelo cabeleireiro manicure maquiagem estetica",
  ti_design: "tecnologia informatica computador programacao designer",
  fotografo: "fotografia foto audiovisual eventos shows",
  professor: "professor ensino aulas educacao",
  mecanico: "mecanica automotiva carro manutencao",
  montador: "montagem moveis",
  producao_eventos: "shows festas eventos produtor producao",
  tecnico_som: "audio sonorizacao shows eventos",
  iluminacao: "luz iluminador shows eventos",
  montagem_palco: "montagem montadores de palcos estrutura palco shows eventos",
  roadie: "instrumentos palco shows eventos",
  dj: "djs discotecagem musica festa shows eventos",
  musico: "cantor cantora banda musica shows eventos",
  seguranca_eventos: "seguranca vigilante shows eventos",
  recepcao_eventos: "recepcionista credenciamento shows eventos",
  garcom: "garcons garçonetes garconete buffet alimentacao festas shows eventos",
  tecnico_led: "painel tela video audiovisual shows eventos",
  cantor: "cantores cantoras vocalista voz palco shows eventos musica",
  auxiliar_cozinha: "ajudante preparo alimentos culinaria restaurante catering buffet",
  cozinheiro: "cozinha gastronomia chef cozinheiros restaurante buffet eventos",
  churrasqueiro: "churrasco carnes cozinha festas eventos buffet",
  confeiteiro: "confeitaria bolos doces sobremesas cozinha buffet",
  copeiro: "copa louca cozinha buffet eventos",
  bartender: "bar drinks coqueteis festas eventos",
  promotor_eventos: "promotora divulgação eventos feiras shows",
  operador_camera: "filmagem cinegrafista audiovisual shows eventos",
  carregador_eventos: "carga descarga carregador shows eventos"
};
export const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function matchesCategory(category, query) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  const text = normalizeSearch([category.label, category.slug, AREAS[category.slug] || ""].join(" "));
  return terms.every(term => text.includes(term));
}
