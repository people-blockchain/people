---
title: "PEOPLE Blockchain — Whitepaper"
description: "A blockchain onde cada usuário é um humano verificado. Propriedade das pessoas, não de VCs."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# PEOPLE Blockchain — Whitepaper

> **A blockchain onde cada usuário é um humano verificado.**
> **Propriedade das pessoas, não de VCs.**

*v1.1 · outubro de 2026 · Os números são preliminares e sujeitos à governança da comunidade. Nada neste documento é uma promessa de renda.*

---

## À primeira vista

| | |
|---|---|
| Fornecimento | **1,000,000,000 PPL**, fixo |
| Cada token lançado | **10%** do fornecimento vai para o pool da comunidade daquele token |
| Taxas de rede queimadas | **0%** — cada taxa é compartilhada |
| Quem ganha recompensas | **Humanos verificados** (telefone do Telegram ou Human Passport) |
| Financiamento | **Auto-financiado.** Sem VC. Sem alocação de investidores. |
| Rede hoje | **Testnet** público — Cosmos EVM, chain id `people_97401-1` / EVM `97401` |

---

## 1. O problema

**Crypto foi construída para insiders.** A maioria das chains assume que você pode ler código, gerenciar seed phrases e identificar uma scam por conta própria.

**Bots ganham as recompensas.** Airdrops e programas de recompensas são explorados por scripts e contas falsas. Pessoas reais ganham pouco.

**Lançamentos favorecem whales.** Rodadas privadas e alocações internas significam que a comunidade geralmente chega por último e paga o preço mais alto.

## 2. Nossa resposta

**Uma blockchain para pessoas comuns.** Um telefone ou um navegador é o suficiente. Lance um token, cunhe cartões de clube ou arrecade dinheiro para uma ideia — com um formulário, não com código.

**Humanos verificados, não bots.** Recompensas vão para contas que passaram uma verificação gratuita de humanidade. Uma pessoa, uma conta. Apenas se inscrever não ganha nada.

**10% de cada token lançado vai para sua comunidade.** Construído no protocolo, não prometido em um post: cada lançamento padrão envia 10% de seu fornecimento para o pool de comunidade daquele token. Nunca se mistura com taxas de rede.

---

## 3. Produto

O que você pode fazer sem código:

| Ferramenta | O que faz | Status |
|---|---|---|
| **Tokens sem código** | Nome, ticker, imagem, fornecimento. O token fica ativo em sua própria curva de ligação; o primeiro trade define o preço. 10% do fornecimento vai para o pool de comunidade do token; a participação do criador veste em 180 dias. | Ativo em testnet |
| **Cartões de clube NFT** | Cartões de associação para um clube, uma café ou uma comunidade — um por membro, com uma imagem que você carrega ou gera. | Ativo em testnet |
| **Arrecadação de fundos** | Colete suporte para um projeto com modelos de contrato revisados: escrow, vesting, voto ponderado por token. Sua comunidade compra na curva, então a demanda define o preço — não uma rodada privada. | Ativo em testnet |
| **Contratos de IA** | Descreva um contrato inteligente em linguagem simples. É montado a partir de templates OpenZeppelin e você vê o resultado antes de implantar. | Ativo em testnet |
| **Agentes de IA comunitários** | Agentes que trabalham para um grupo: uma carteira comunitária multisig com limites de gastos, listas brancas e um congelamento de emergência. Os parâmetros mudam apenas por voto do token; cada ação é visível no explorer. | Testnet: 1 agente comunitário ativo |

---

## 4. Tecnologia

**Cosmos EVM.** PEOPLE é executado em uma stack Cosmos EVM: contratos inteligentes compatíveis com Ethereum e endereços 0x em uma chain Cosmos.

| Parâmetro | Valor |
|---|---|
| Cosmos chain id | `people_97401-1` |
| EVM chain id | `97401` |
| Moeda nativa | PPL (denom base `appl`, 18 decimais) |
| Prefixo de endereço | `people1…` (e a mesma conta como `0x…` em EVM) |
| Status da rede | Testnet público — não é mainnet |

**Validadores.** Os validadores executam a rede e são pagos do pool pré-alocado de validadores mais 30% de cada taxa de rede. Os validadores de testnet são executados apenas para testes; abrir validação e staking ao público é um estágio posterior do roadmap.

**Verificação — uma verificação de que você é uma pessoa.** Gratuita, feita uma vez:

- **Nível 1 — Telegram:** compartilhe seu número de telefone uma vez em nosso bot Telegram. Um número por fundador. Ganha 50% dos pontos base.
- **Nível 2 — Human Passport:** verifique com Human Passport. Ganha 100% dos pontos base.
- **Sem verificação, sem pontos.** Sem pontos de fundador em testnet e sem recompensas pessoais de PPL em mainnet sem ela.

---

## 5. Tokenomia

**Fornecimento fixo: 1,000,000,000 PPL.** Anos 1–4: inflação de 0%. A partir do ano 5, qualquer nova emissão é limitada a 2% ao ano e apenas por voto da comunidade.

### Alocação de genesis

| Bucket | Participação | PPL |
|---|---:|---:|
| Comunidade e recompensas | 35% | 350,000,000 |
| Validadores e staking | 20% | 200,000,000 |
| Equipe e fundadores | 15% | 150,000,000 |
| Tesouro de ecossistema (DAO) | 15% | 150,000,000 |
| Venda comunitária | 10% | 100,000,000 |
| Liquidez | 5% | 50,000,000 |

- **Vesting de equipe e fundadores (15% do fornecimento):** 0% no lançamento, cliff de 6 meses, depois 18 meses linear (24 meses no total).
- **Sem bucket de investidor.** Não há alocação de VC ou rodada privada.
- **Recompensas vêm de pools existentes.** Fundadores, bounties, embaixadores e airdrops são pagos apenas do bucket de Comunidade e recompensas. Nenhuma moeda nova é cunhada para eles.

### Divisão de taxa de rede

Cada taxa de protocolo, incluindo taxas fracionárias, é dividida da mesma forma:

| Destinatário | Participação |
|---|---:|
| Validadores | 30% |
| Pool comunitário | 25% |
| Tesouro | 20% |
| Liquidez | 10% |
| Growth Pool | 15% |
| Burn | 0% |

**Fluxo de taxas.** 100% das taxas de lançamento de tokens e NFTs (USDC/USDT) vão para recompras públicas de PPL, e o PPL recomprado é dividido 30/25/20/10/15 pela multisig de tesouraria, tal como qualquer outra recompra.

**Taxa de lançamento de token.** Ativa na testnet: as fábricas implantadas ainda cobram uma taxa fixa em PPL — 1,045005 PPL para lançar um token e 2,925 PPL para criar um NFT. O plano aprovado é um valor fixo de **1 USD por lançamento de token e 2 USD por mint de NFT**, pagável em PPL, USDT ou USDC, com 20% de desconto ao pagar em PPL por um preço TWAP. A opção de stablecoin e o desconto TWAP ainda não estão no código implantado. 100% das taxas de lançamento vão para a recompra pública de PPL, e o PPL recomprado é dividido 30/25/20/10/15 pelo multisig do tesouro, como qualquer outra recompra.

---

## 6. Million Founders

**Seja uma das primeiras milhões de pessoas verificadas.** Obtenha um número de fundador, convide amigos e ganhe pontos quando *eles* fizerem coisas reais na rede.

**Os pontos vêm de ações reais, não de inscrições.** Você ganha pontos de convite apenas após seu convidado ter verificado, criado uma carteira e feito pelo menos uma ação real de testnet (swap, pool de liquidez, cunhagem de NFT, lançamento de token ou voto de governança). Apenas inscrição = 0.

**Como os pontos se tornam PPL:**

> **PPL por ponto = pool da temporada ÷ todos os pontos ganhos na temporada**

- **Pool da Temporada 1:** 6,000,000 PPL, pagos do pool existente do Million Founders. Sem moedas novas. Quando o pool estiver vazio, o programa para.
- **Pagamento:** 10% imediatamente, os 90% restantes em fatias iguais semanais ao longo de 52 semanas.
- **Anti-farming:** apenas dois níveis de referência, um limite por temporada em convidados ativos e recuperação de pontos de contas sinalizadas como bots.

*Preliminar. Pontos, a taxa PPL-por-ponto e o orçamento da temporada podem mudar antes da mainnet. Não é uma promessa de renda.*

---

## 7. Roadmap

| Estágio | O que acontece | Gate |
|---|---|---|
| **Temporada 0 — Testnet público** | Carteiras, verificação, lançamentos de tokens, cartões NFT, swaps, pontos do Million Founders. | Agora |
| **Venda de PPL na Base** | A venda de PPL ocorre apenas na Base (PplCurveHub, USDC ou USDT). Os parâmetros publicados (curva exponencial a partir de **$0.005** por PPL, até **100M PPL** na curva, graduação em **$4M**) estão em `/buy`; compras permanecem desativadas até o contrato de venda ser publicado. O mainnet da rede PEOPLE é uma etapa separada. | Contrato de venda (PplCurveHub na Base) e multisig receptor publicados |
| **Staking e validadores** | Staking e participação de validador abrem além do projeto. | Após mainnet |

Nenhuma data é prometida. Cada estágio começa quando seu gate é atendido.

---

## 8. Equipe e financiamento

- **Anônimo por escolha.** Uma pequena equipe. Publicamos trabalho, código e regras, não rostos.
- **Auto-financiado.** Sem dinheiro de VC. Sem alocações de investidor. Sem rodada privada.
- **As mesmas regras para todos.** O vesting da equipe: 0% no lançamento, cliff de 6 meses, depois 18 meses linear (24 meses no total). Não há linha de equipe na divisão de taxa de rede.

---

## 9. Segurança

- Revisado por modelos de IA: Claude Opus 5.5, GPT Astra, Fable 5.1 (executados pela equipe do projeto). Isto não é uma auditoria de segurança. Ainda não houve auditoria externa. Bug bounty on every page.
- **Multisigs.** Tesouraria das taxas de rede: um multisig 2 de 3 na rede PEOPLE. Recursos da venda: o multisig do projeto na Base; seu endereço e o limite de assinaturas são publicados antes da abertura da venda.
- **Endereços publicados.** O contrato de venda e o multisig recebedor são publicados antes da abertura da venda; os contratos de vesting e de bloqueio de LP, no lançamento completo da rede. Sem marcadores provisórios.
- **Defesa contra bots.** Verificação humana, limites por dispositivo e IP, limites diários de pontos e clawback de bots.
- **Blocos de construção comprovados.** Contratos sem código são montados a partir de templates OpenZeppelin.

---

## 10. Riscos e aviso legal

- **Sem promessa de renda.** PPL, pontos e recompensas não são um produto de investimento. Nada aqui promete lucro, rendimento ou retornos.
- **Os preços podem ir para zero.** Os preços dos tokens podem subir, descer ou ir para zero.
- **Testnet não é mainnet.** Tokens de testnet e saldos não têm valor. Os pontos são um registro de atividade, não uma garantia de pagamento.
- **Tudo é preliminar.** Números, cronogramas e regras podem mudar antes da mainnet e estão sujeitos à governança da comunidade.
- **Risco tecnológico.** O software pode ter bugs. Uma auditoria reduz o risco; não o remove.
- **Regulação.** As regras variam por país e podem mudar. Os parâmetros da venda de PPL estão em `/buy` (curva a partir de **$0.005** por PPL); compras permanecem desativadas até o hub ser implantado. Não há KYC nem verificações de elegibilidade neste site.
- **Faça sua própria pesquisa.** Este whitepaper é informação, não é conselho financeiro, legal ou fiscal.

---

## Como somos diferentes

Apenas fatos públicos verificáveis sobre outras redes. Fontes abaixo.

| | Ethereum | Solana | PEOPLE |
|---|---|---|---|
| Taxas queimadas | Taxa base é queimada ¹ | 50% da taxa base é queimada ² | **0% queimado** |
| Quem recebe taxas | Validadores recebem a taxa de prioridade (dica) ¹ | Validadores recebem 50% da taxa base e 100% da taxa de prioridade ² | **Validadores 30 · Comunidade 25 · Tesouro 20 · Liquidez 10 · Growth 15** |
| Financiamento inicial | Venda pública de ether, 2014 (42 dias, pago em BTC) ³ | Série A de $20M liderada pela Multicoin Capital (2019); investidores receberam tokens SOL ⁴ | **Auto-financiado. Sem VC, sem alocação de investidor** |
| Criação de conta | Criar uma conta não custa nada; sem verificação de identidade ⁵ | Não é um requisito de protocolo | **Recompensas apenas para humanos verificados** |
| Participação da comunidade em novo token | Não é uma regra de protocolo | Não é uma regra de protocolo | **10% de cada token lançado** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana-blockchain
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Fontes verificadas em outubro de 2026. "Não é uma regra/requisito de protocolo" significa que a documentação citada não descreve tal regra. Isso compara escolhas de design, não qualidade.*

---

## Links

- Website: https://www.peopleblockchain.network
- Million Founders: https://www.peopleblockchain.network/founders
- Litepaper: https://www.peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### O que mudou na v1.1

- A parte da comunidade em um novo token é **10%** da oferta, alocados no lançamento.
- O vesting da equipe é **0% no lançamento, um cliff de 6 meses e depois 18 meses lineares** (24 meses no total).
- Taxas de lançamento: o plano aprovado é um valor fixo de **1 USD por lançamento de token e 2 USD por mint de NFT**, pagável em PPL, USDT ou USDC, com 20% de desconto ao pagar em PPL por um preço TWAP; as fábricas implantadas ainda cobram uma taxa fixa em PPL.
- A **venda comunitária de PPL** usa a curva exponencial publicada em `/buy` (início **$0.005** por PPL; preços e limites públicos; compra desativada até o hub). Não há KYC nem verificações de elegibilidade neste site.
- Segurança: Revisado por modelos de IA: Claude Opus 5.5, GPT Astra, Fable 5.1 (executados pela equipe do projeto). Isto não é uma auditoria de segurança. Ainda não houve auditoria externa.; bug bounty on every page.
- Multisigs. Tesouraria das taxas de rede: um multisig 2 de 3 na rede PEOPLE. Recursos da venda: o multisig do projeto na Base; seu endereço e o limite de assinaturas são publicados antes da abertura da venda.
- Se a curva de um token não esgotar em **180 dias** após o lançamento, qualquer pessoa pode finalizá-la e os tokens não vendidos vão para o pool comunitário desse token. Uma curva esgotada passa para a liquidez como antes. (Ativo na testnet.)
- A venda dura até esgotar (a curva fecha ao arrecadar US$ 4M) ou 24 meses após a abertura, o que ocorrer primeiro. Não há prorrogação. Os PPL não vendidos vão para o Community Pool. Não há reembolsos: toda compra é definitiva.
