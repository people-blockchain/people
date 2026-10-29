---
title: "PEOPLE Blockchain — Litepaper"
description: "La blockchain où chaque utilisateur est une personne vérifiée. Propriété des gens, pas des VCs."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# PEOPLE Blockchain — Litepaper

> **La blockchain où chaque utilisateur est une personne vérifiée.**
> **Propriété des gens, pas des VCs.**

*v1.1 · octobre 2026 · Les chiffres sont préliminaires et soumis à la gouvernance communautaire. Rien dans ce document n'est une promesse de revenus.*

---

## Un coup d'œil

| | |
|---|---|
| Approvisionnement | **1 000 000 000 PPL**, fixe |
| Chaque token lancé | **10 %** de l'approvisionnement va au pool communautaire de ce token |
| Frais réseau brûlés | **0 %** — chaque frais est partagé |
| Qui gagne des récompenses | **Personnes vérifiées** (téléphone Telegram ou Human Passport) |
| Financement | **Autofinancé.** Pas de VC. Pas d'allocation investisseur. |
| Réseau aujourd'hui | Testnet public **testnet** — Cosmos EVM, chain id `people_97401-1` / EVM `97401` |

---

## 1. Le problème

**La crypto a été construite pour les initiés.** La plupart des chaînes supposent que vous pouvez lire du code, gérer des phrases de récupération et identifier une arnaque par vous-même.

**Les bots reçoivent les récompenses.** Les largages et les programmes de récompenses sont cultivés par des scripts et de faux comptes. Les vraies personnes reçoivent une miette.

**Les lancements favorisent les baleines.** Les tours privés et les allocations d'initiés signifient que la communauté arrive souvent en dernier et paie le prix le plus élevé.

## 2. Notre réponse

**Une blockchain pour les gens ordinaires.** Un téléphone ou un navigateur suffit. Lancez un token, créez des cartes de club ou levez des fonds pour une idée — avec un formulaire, pas du code.

**Personnes vérifiées, pas de bots.** Les récompenses vont aux comptes qui ont passé un contrôle humain gratuit. Une personne, un compte. L'inscription seule ne gagne rien.

**10 % de chaque token lancé va à sa communauté.** Intégré au protocole, non pas promis dans un post : chaque lancement standard envoie 10 % de son approvisionnement au pool communautaire de ce token. Il n'est jamais mélangé aux frais réseau.

---

## 3. Produit

Ce que vous pouvez faire sans code :

| Outil | Ce qu'il fait | Statut |
|---|---|---|
| **Tokens sans code** | Nom, ticker, image, approvisionnement. Le token se met en direct sur sa propre courbe de liaison ; le premier échange définit le prix. 10 % de l'approvisionnement va au pool communautaire du token ; la part du créateur s'accumule sur 180 jours. | Live sur testnet |
| **Cartes de club NFT** | Cartes d'adhésion pour un club, un café ou une communauté — une par membre, avec une image que vous téléchargez ou générez. | Live sur testnet |
| **Levée de fonds** | Collectez le soutien pour un projet avec des modèles de contrats examinés : dépôt de garantie, accumulation, vote pondéré par token. Votre communauté achète sur la courbe, donc la demande définit le prix — pas un tour privé. | Live sur testnet |
| **Contrats IA** | Décrivez un contrat intelligent en langage clair. Il est assemblé à partir de modèles OpenZeppelin et vous voyez le résultat avant de déployer. | Live sur testnet |
| **Agents IA communautaires** | Agents qui travaillent pour un groupe : un portefeuille communautaire multisig avec limites de dépenses, listes blanches et un gel d'urgence. Les paramètres ne changent que par vote de token ; chaque action est visible dans l'explorateur. | Testnet : 1 agent communautaire actif |

---

## 4. Technologie

**Cosmos EVM.** PEOPLE fonctionne sur une pile Cosmos EVM : contrats intelligents compatibles Ethereum et adresses 0x sur une chaîne Cosmos.

| Paramètre | Valeur |
|---|---|
| ID de chaîne Cosmos | `people_97401-1` |
| ID de chaîne EVM | `97401` |
| Pièce native | PPL (dénomination de base `appl`, 18 décimales) |
| Préfixe d'adresse | `people1…` (et le même compte que `0x…` en EVM) |
| Statut du réseau | Testnet public — pas mainnet |

**Validateurs.** Les validateurs gèrent le réseau et sont payés à partir du pool de validateurs pré-alloué plus 30 % de chaque frais réseau. Les validateurs testnet fonctionnent à titre de test uniquement ; l'ouverture de la validation et de l'enjeu au public est une étape ultérieure de la feuille de route.

**Vérification — un contrôle que vous êtes une personne.** Gratuit, fait une seule fois :

- **Niveau 1 — Telegram :** partagez votre numéro de téléphone une fois dans notre bot Telegram. Un numéro par fondateur. Gagne 50 % des points de base.
- **Niveau 2 — Human Passport :** vérifiez avec Human Passport. Gagne 100 % des points de base.
- **Pas de vérification, pas de points.** Pas de points fondateur sur testnet et pas de récompenses PPL personnelles sur mainnet sans cela.

---

## 5. Tokenomique

**Approvisionnement fixe : 1 000 000 000 PPL.** Années 1 à 4 : inflation de 0 %. À partir de l'année 5, toute nouvelle émission est plafonnée à 2 % par an et uniquement par vote communautaire.

### Allocation Genesis

| Seau | Part | PPL |
|---|---:|---:|
| Communauté et récompenses | 35 % | 350 000 000 |
| Validateurs et enjeu | 20 % | 200 000 000 |
| Équipe et fondateurs | 15 % | 150 000 000 |
| Trésor écosystème (DAO) | 15 % | 150 000 000 |
| Vente communautaire | 10 % | 100 000 000 |
| Liquidité | 5 % | 50 000 000 |

- **Accumulation équipe et fondateurs (15 % de l'approvisionnement) :** 0 % au lancement, falaise de 6 mois, puis 18 mois linéaires (24 mois au total).
- **Pas de seau investisseur.** Il n'y a pas d'allocation VC ou tour privé.
- **Les récompenses proviennent des pools existants.** Les fondateurs, les primes, les ambassadeurs et les largages ne sont payés que depuis le pool Communauté et récompenses. Aucune nouvelle pièce n'est frappée pour eux.

### Répartition des frais réseau

Chaque frais de protocole, y compris les frais fractionnaires, est réparti de la même manière :

| Destinataire | Part |
|---|---:|
| Validateurs | 30 % |
| Pool communautaire | 25 % |
| Trésor | 20 % |
| Liquidité | 10 % |
| Pool de croissance | 15 % |
| Brûlure | 0 % |

**Flux de frais.** 100% des frais de lancement de tokens et NFT (USDC/USDT) vont aux rachats publics de PPL, et les PPL rachetés sont répartis 30/25/20/10/15 par le multisig de trésorerie, comme pour tout autre rachat.

**Frais de lancement de token.** En direct sur le testnet : les usines déployées facturent encore des frais fixes en PPL — 1,045005 PPL pour lancer un token et 2,925 PPL pour créer un NFT. Le plan approuvé est un montant fixe de **1 USD par lancement de token et 2 USD par mint de NFT**, payable en PPL, USDT ou USDC, avec une remise de 20 % en payant en PPL à un prix TWAP. L'option stablecoin et la remise TWAP ne sont pas encore dans le code déployé. 100 % des frais de lancement vont au rachat public de PPL, et le PPL racheté est partagé 30/25/20/10/15 par le multisig du trésor, comme tout autre rachat.

---

## 6. Million de Fondateurs

**Soyez l'une des premières millions de personnes vérifiées.** Obtenez un numéro de fondateur, invitez des amis et gagnez des points quand *ils* font de vraies choses sur le réseau.

**Les points proviennent d'actions réelles, pas d'inscriptions.** Vous ne gagnez des points d'invitation que après que votre invité se soit vérifié, ait créé un portefeuille et ait effectué au moins une vraie action testnet (échange, pool de liquidité, mint NFT, lancement de token ou vote de gouvernance). L'inscription seule = 0.

**Comment les points deviennent PPL :**

> **PPL par point = pool de saison ÷ tous les points gagnés en saison**

- **Pool de saison 1 :** 6 000 000 PPL, payés depuis le pool Million Founders existant. Pas de nouvelles pièces. Quand le pool est vide, le programme s'arrête.
- **Paiement :** 10 % à la fois, les 90 % restants en tranches hebdomadaires égales sur 52 semaines.
- **Anti-culture :** deux niveaux de parrainage seulement, un plafond par saison sur les parrainés actifs, et récupération des points des comptes signalés comme bots.

*Préliminaire. Les points, le taux PPL par point et le budget de saison peuvent changer avant mainnet. Pas une promesse de revenus.*

---

## 7. Feuille de route

| Étape | Que se passe-t-il | Porte |
|---|---|---|
| **Saison 0 — Testnet public** | Portefeuilles, vérification, lancements de tokens, cartes NFT, swaps, points Million Founders. | Maintenant |
| **Mainnet et vente PPL** | Le mainnet du réseau PEOPLE et la vente PPL démarrent ensemble le 1er décembre 2026. Le paiement se fait en USDC ou USDT sur Base ; les PPL sont émis et crédités immédiatement sur le mainnet PEOPLE. Les paramètres publiés (courbe exponentielle dès **0,005 $** par PPL, jusqu'à **100M PPL** sur la courbe, graduation à **4 M$**) sont sur `/buy`. | Lancement le 1er décembre 2026 |
| **Enjeu et validateurs** | L'enjeu et la participation des validateurs s'ouvrent au-delà du projet. | Après mainnet |

Chaque étape commence quand son jalon est atteint. Hormis le lancement du mainnet et de la vente de PPL le 1er décembre 2026, aucune date n'est promise.

---

## 8. Équipe et financement

- **Anonyme par choix.** Une petite équipe. Nous publions le travail, le code et les règles, pas les visages.
- **Autofinancé.** Pas d'argent VC. Pas d'allocations d'investisseur. Pas de tour privé.
- **Mêmes règles que tout le monde.** L'accumulation de l'équipe : 0 % au lancement, falaise de 6 mois, puis 18 mois linéaires (24 mois au total). Il n'y a pas de ligne d'équipe dans la répartition des frais réseau.

---

## 9. Sécurité

- Examiné par des modèles d’IA : Claude Opus 5.5, GPT Astra, Fable 5.1 (lancés par l’équipe du projet). Ce n’est pas un audit de sécurité. Aucun audit externe n’a encore été réalisé. Bug bounty on every page.
- **Multisigs.** Trésorerie des frais de réseau : un multisig 2 sur 3 sur le réseau PEOPLE. Fonds de la vente : le multisig du projet sur Base ; son adresse et son seuil de signatures sont publiés avant l’ouverture de la vente.
- **Adresses publiées.** Le contrat de vente et le multisig destinataire sont publiés avant l’ouverture de la vente ; les contrats de vesting et de verrouillage des LP, au lancement complet du réseau. Aucune adresse fictive.
- **Défense contre les bots.** Vérification humaine, limites par appareil et par IP, plafonds de points quotidiens et récupération de points des bots.
- **Blocs de construction éprouvés.** Les contrats sans code sont assemblés à partir de modèles OpenZeppelin.

---

## 10. Risques et avertissement

- **Pas de promesse de revenus.** PPL, les points et les récompenses ne sont pas un produit d'investissement. Rien ici ne promet un profit, un rendement ou des rendements.
- **Les prix peuvent aller à zéro.** Les prix des tokens peuvent augmenter, diminuer ou aller à zéro.
- **Testnet n'est pas mainnet.** Les tokens testnet et les soldes n'ont aucune valeur. Les points sont un enregistrement d'activité, pas une garantie de paiement.
- **Tout est préliminaire.** Les chiffres, les calendriers et les règles peuvent changer avant mainnet et sont soumis à la gouvernance communautaire.
- **Risque technologique.** Le logiciel peut avoir des bogues. Un audit réduit le risque ; il ne l'élimine pas.
- **Réglementation.** Les règles varient selon le pays et peuvent changer. Les paramètres de vente PPL sont sur `/buy` (courbe dès **0,005 $** par PPL) ; les achats restent désactivés tant que le hub n'est pas déployé. Aucun KYC ni contrôle d'éligibilité sur ce site.
- **Faites vos propres recherches.** Ce litepaper est une information, pas un conseil financier, juridique ou fiscal.

---

## Comment nous différons

Seulement des faits publics vérifiables sur d'autres réseaux. Sources ci-dessous.

| | Ethereum | Solana | PEOPLE |
|---|---|---|---|
| Frais brûlés | Les frais de base sont brûlés ¹ | 50 % des frais de base sont brûlés ² | **0 % brûlés** |
| Qui reçoit les frais | Les validateurs reçoivent les frais de priorité (pourboire) ¹ | Les validateurs reçoivent 50 % des frais de base et 100 % des frais de priorité ² | **Validateurs 30 · Communauté 25 · Trésor 20 · Liquidité 10 · Croissance 15** |
| Financement précoce | Vente d'ether publique, 2014 (42 jours, payée en BTC) ³ | Série A de 20 millions de dollars menée par Multicoin Capital (2019) ; les investisseurs ont reçu des tokens SOL ⁴ | **Autofinancé. Pas de VC, pas d'allocation d'investisseur** |
| Création de compte | La création d'un compte ne coûte rien ; pas de contrôle d'identité ⁵ | Pas une exigence du protocole | **Récompenses seulement pour les personnes vérifiées** |
| Part communautaire du nouveau token | Pas une règle du protocole | Pas une règle du protocole | **10 % de chaque token lancé** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana-blockchain
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Sources vérifiées en octobre 2026. « Pas une règle/exigence du protocole » signifie que la documentation citée ne décrit pas une telle règle. Cela compare des choix de conception, pas la qualité.*

---

## Liens

- Website: https://www.peopleblockchain.network
- Million Founders: https://www.peopleblockchain.network/founders
- Litepaper: https://www.peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### Ce qui a changé en v1.1

- La part communautaire d'un nouveau token est de **10 %** de l'offre, alloués au lancement.
- Le vesting de l'équipe est de **0 % au lancement, un cliff de 6 mois, puis 18 mois linéaires** (24 mois au total).
- Frais de lancement : le plan approuvé est un montant fixe de **1 USD par lancement de token et 2 USD par mint de NFT**, payable en PPL, USDT ou USDC, avec une remise de 20 % en payant en PPL à un prix TWAP ; les usines déployées facturent encore des frais fixes en PPL.
- La **vente communautaire de PPL** suit la courbe exponentielle publiée sur `/buy` (départ **0,005 $** par PPL ; prix et limites publics ; achat désactivé jusqu'au hub). Aucun KYC ni contrôle d'éligibilité sur ce site.
- Sécurité : Examiné par des modèles d’IA : Claude Opus 5.5, GPT Astra, Fable 5.1 (lancés par l’équipe du projet). Ce n’est pas un audit de sécurité. Aucun audit externe n’a encore été réalisé. ; bug bounty on every page.
- Multisigs. Trésorerie des frais de réseau : un multisig 2 sur 3 sur le réseau PEOPLE. Fonds de la vente : le multisig du projet sur Base ; son adresse et son seuil de signatures sont publiés avant l’ouverture de la vente.
- Si la courbe d'un token n'est pas épuisée **180 jours** après le lancement, n'importe qui peut la clôturer et les tokens invendus vont au pool communautaire de ce token. Une courbe épuisée passe en liquidité comme avant. (Actif sur le testnet.)
- La vente dure jusqu’à épuisement (la courbe se ferme à 4 M$ levés) ou 24 mois après l’ouverture, selon la première échéance. Aucune prolongation. Les PPL invendus vont au Community Pool. Aucun remboursement : tout achat est définitif.
