import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const guidance = {
  feed: ["Como usar o feed", "Veja vagas e publicações próximas. Use a pesquisa para filtrar a área de atuação. Ao se candidatar, aguarde a escolha do contratante."],
  mapa: ["Sobre a localização", "O mapa usa a localização disponível no aparelho. No computador ela pode ser aproximada; confira o endereço do serviço antes de se candidatar."],
  pedidos: ["Acompanhe seus compromissos", "Em Compromissos, acompanhe os serviços aceitos, registre a chegada e a conclusão. Se houver um imprevisto, use o cancelamento com justificativa antes de iniciar o serviço."],
  carteira: ["Entenda sua carteira", "Depositar gera um Pix; o saldo só entra após a confirmação. Sacar permite revisar o valor e a chave antes do envio. O Extrato mostra o andamento de cada movimentação. Não repita um pagamento que está sendo conferido."],
  empresas: ["Controle por empresa ou filial", "Cadastre a unidade com seu endereço e selecione-a ao publicar a vaga. Os custos vinculados e os lançamentos manuais ajudam a acompanhar os gastos de cada unidade."],
  perfil: ["Mantenha seu perfil atualizado", "Informe suas áreas de atuação e sua localização para facilitar o encontro com oportunidades próximas. Revise seus dados antes de salvar."],
};

export function ConnectionNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return !online && <p role="alert" className="mb-4 border border-border bg-card p-4 text-sm">Você está sem conexão. As informações podem estar desatualizadas. Reconecte-se antes de enviar uma solicitação.</p>;
}

export function AppGuidance({ page }) {
  const entry = guidance[page];
  return entry && <details key={page} className="mt-8 border-t border-border pt-4 text-sm text-muted-foreground">
    <summary className="cursor-pointer py-2 font-semibold text-foreground">{entry[0]}</summary>
    <p className="mt-2 max-w-2xl leading-relaxed">{entry[1]}</p>
    {page !== "feed" && <Link className="mt-3 inline-block underline underline-offset-4" to="/feed">Voltar ao feed</Link>}
  </details>;
}
