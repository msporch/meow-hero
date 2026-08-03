/**
 * Links de pagamento das skins vendidas em dinheiro.
 *
 * O jogo NÃO processa pagamento e não guarda dado de cartão: ele apenas abre
 * o link do provedor que você configurar aqui (Stripe Payment Link, Mercado
 * Pago, PagSeguro — qualquer um que gere uma URL de checkout).
 *
 * Enquanto o link estiver vazio, a loja mostra a skin como INDISPONIVEL em vez
 * de fingir uma compra.
 *
 * Liberar a skin depois do pagamento é o passo que falta e depende da sua
 * conta no provedor: o caminho correto é o webhook do provedor avisar o
 * servidor (server/) e ele conceder a skin ao aparelho. Ver README.
 *
 * Exemplo:
 *   astro: 'https://buy.stripe.com/xxxxxxxxxxxx',
 */
export const PAY_LINKS = {
  astro: '',
  esqueleto: '',
};
