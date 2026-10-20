---
title: "People Blockchain — Litepaper"
description: "La blockchain donde cada usuario es una persona verificada. Propiedad de las personas, no de capitales de riesgo."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# People Blockchain — Litepaper

> **La blockchain donde cada usuario es una persona verificada.**
> **Propiedad de las personas, no de capitales de riesgo.**

*v1.1 · Octubre 2026 · Los números son preliminares y están sujetos a gobernanza comunitaria. Nada en este documento es una promesa de ingresos.*

---

## De un vistazo

| | |
|---|---|
| Suministro | **1.000.000.000 PPL**, fijo |
| Cada token lanzado | **10%** del suministro va al fondo comunitario de ese token |
| Comisiones de red quemadas | **0%** — cada comisión se comparte |
| Quién gana recompensas | **Humanos verificados** (teléfono de Telegram o Human Passport) |
| Financiación | **Auto-financiado.** Sin capitales de riesgo. Sin asignación de inversores. |
| Red hoy | Testnet público **Cosmos EVM**, chain id `people_97401-1` / EVM `97401` |

---

## 1. El problema

**Las criptomonedas fueron construidas para privilegiados.** La mayoría de blockchains asumen que puedes leer código, gestionar frases de recuperación e identificar estafas por tu cuenta.

**Los bots obtienen las recompensas.** Los airdrops y programas de recompensas son explotados por scripts y cuentas falsas. Las personas reales obtienen una migaja.

**Los lanzamientos favorecen a las ballenas.** Las rondas privadas y asignaciones de privilegiados significan que la comunidad a menudo llega al final y paga el precio más alto.

## 2. Nuestra respuesta

**Una blockchain para personas ordinarias.** Un teléfono o un navegador es suficiente. Lanza un token, crea tarjetas de club o recauda dinero para una idea — con un formulario, no código.

**Humanos verificados, no bots.** Las recompensas van a cuentas que pasaron una verificación de humanidad gratuita. Una persona, una cuenta. El registro solo no genera nada.

**El 10% de cada token lanzado va a su comunidad.** Incorporado en el protocolo, no prometido en un post: cada lanzamiento estándar envía el 10% de su suministro al fondo comunitario propio de ese token. Nunca se mezcla con las comisiones de la red.

---

## 3. Producto

Lo que puedes hacer sin código:

| Herramienta | Qué hace | Estado |
|---|---|---|
| **Tokens sin código** | Nombre, símbolo, imagen, suministro. El token se activa en su propia curva de enlace; la primera transacción establece el precio. El 10% del suministro va al fondo comunitario del token; la participación del creador se devenga durante 180 días. | Activo en testnet |
| **Tarjetas de club NFT** | Tarjetas de membresía para un club, una cafetería o una comunidad — una por miembro, con una imagen que cargas o generas. | Activo en testnet |
| **Recaudación de fondos** | Recopila apoyo para un proyecto con plantillas de contrato revisadas: depósito en garantía, devengo, voto ponderado por token. Tu comunidad compra en la curva, por lo que la demanda establece el precio — no una ronda privada. | Activo en testnet |
| **Contratos AI** | Describe un contrato inteligente en palabras simples. Se ensambla a partir de plantillas de OpenZeppelin y ves el resultado antes de implementar. | Activo en testnet |
| **Agentes AI comunitarios** | Agentes que trabajan para un grupo: una cartera comunitaria multifirma con límites de gastos, listas blancas y congelación de emergencia. Los parámetros cambian solo por voto de token; cada acción es visible en el explorador. | Testnet: 1 agente comunitario activo |

---

## 4. Tecnología

**Cosmos EVM.** People se ejecuta en un stack Cosmos EVM: contratos inteligentes compatibles con Ethereum y direcciones 0x en una cadena Cosmos.

| Parámetro | Valor |
|---|---|
| Cosmos chain id | `people_97401-1` |
| EVM chain id | `97401` |
| Moneda nativa | PPL (denominación base `appl`, 18 decimales) |
| Prefijo de dirección | `people1…` (y la misma cuenta que `0x…` en EVM) |
| Estado de la red | Testnet público — no mainnet |

**Validadores.** Los validadores ejecutan la red y se pagan desde el fondo de validadores preasignado más el 30% de cada comisión de red. Los validadores de testnet se ejecutan solo para pruebas; abrir validación y apuestas al público es una etapa posterior en el mapa de ruta.

**Verificación — una verificación de que eres una persona.** Gratuita, se realiza una vez:

- **Nivel 1 — Telegram:** comparte tu número de teléfono una vez en nuestro bot de Telegram. Un número por fundador. Gana el 50% de los puntos base.
- **Nivel 2 — Human Passport:** verifica con Human Passport. Gana el 100% de los puntos base.
- **Sin verificación, sin puntos.** Sin puntos de fundador en testnet y sin recompensas personales de PPL en mainnet sin verificación.

---

## 5. Tokenómica

**Suministro fijo: 1.000.000.000 PPL.** Años 1–4: inflación del 0%. A partir del año 5, cualquier nueva emisión se limita al 2% anual y solo por voto comunitario.

### Asignación de origen

| Categoría | Proporción | PPL |
|---|---:|---:|
| Comunidad y recompensas | 35% | 350.000.000 |
| Validadores y apuestas | 20% | 200.000.000 |
| Equipo y fundadores | 15% | 150.000.000 |
| Tesorería de ecosistema (DAO) | 15% | 150.000.000 |
| Venta comunitaria | 10% | 100.000.000 |
| Liquidez | 5% | 50.000.000 |

- **Devengo de equipo y fundadores (15% del suministro):** 0% en el lanzamiento, acantilado de 6 meses, luego 18 meses lineales (24 meses en total).
- **Sin categoría de inversores.** No hay asignación de capitales de riesgo o ronda privada.
- **Las recompensas provienen de fondos existentes.** Los fundadores, recompensas, embajadores y airdrops se pagan solo desde el fondo de Comunidad y recompensas. No se acuñan nuevas monedas para ellos.

### División de comisiones de red

Cada comisión de protocolo, incluidas las comisiones fraccionarias, se divide de la misma manera:

| Destinatario | Proporción |
|---|---:|
| Validadores | 30% |
| Fondo comunitario | 25% |
| Tesorería | 20% |
| Liquidez | 10% |
| Fondo de crecimiento | 15% |
| Quema | 0% |

**Flujo de tarifas.** 100% de las tarifas de lanzamiento de tokens y NFT (USDC/USDT) se destinan a recompras públicas de PPL, y el PPL recomprado se divide 30/25/20/10/15 por el multisig de tesorería, igual que cualquier otra recompra.

**Comisión de lanzamiento de token.** Activa en testnet: las fábricas desplegadas aún cobran una comisión fija en PPL — 1,045005 PPL por lanzar un token y 2,925 PPL por acuñar un NFT. El plan aprobado es un importe fijo de **1 USD por lanzamiento de token y 2 USD por mint de NFT**, pagadero en PPL, USDT o USDC, con un 20% de descuento al pagar en PPL a un precio TWAP. La opción de moneda estable y el descuento TWAP aún no están en el código desplegado. El 100% de las comisiones de lanzamiento va a la recompra pública de PPL, y el PPL recomprado se reparte 30/25/20/10/15 por el multisig del tesoro, igual que cualquier otra recompra.

---

## 6. Un Millón de Fundadores

**Sé una de las primeras mil millones de personas verificadas.** Obtén un número de fundador, invita amigos y gana puntos cuando *ellos* hacen cosas reales en la red.

**Los puntos provienen de acciones reales, no de registros.** Ganas puntos de invitación solo después de que tu invitado se haya verificado, creado una cartera y haya realizado al menos una acción real de testnet (intercambio, fondo de liquidez, acuñación de NFT, lanzamiento de token o voto de gobernanza). Solo registro = 0.

**Cómo los puntos se convierten en PPL:**

> **PPL por punto = fondo de temporada ÷ todos los puntos ganados en la temporada**

- **Fondo de Temporada 1:** 6.000.000 PPL, pagados desde el fondo existente de Un Millón de Fundadores. Sin nuevas monedas. Cuando el fondo esté vacío, el programa se detiene.
- **Pago:** 10% de una vez, los 90% restantes en porciones semanales iguales durante 52 semanas.
- **Anti-explotación:** solo dos niveles de referidos, un límite por temporada en invitados activos y recuperación de puntos de cuentas marcadas como bots.

*Preliminar. Los puntos, la tasa PPL por punto y el presupuesto de temporada pueden cambiar antes de mainnet. No es una promesa de ingresos.*

---

## 7. Mapa de ruta

| Etapa | Qué sucede | Condición |
|---|---|---|
| **Temporada 0 — Testnet público** | Carteras, verificación, lanzamientos de tokens, tarjetas NFT, intercambios, puntos de Un Millón de Fundadores. | Ahora |
| **Mainnet + venta de PPL** | Se lanza mainnet. Los parámetros publicados (curva exponencial desde **$0.005** por PPL, hasta **100M PPL** en la curva; la venta termina al agotarse o a los **24 meses**) están en `/buy`; las compras siguen desactivadas hasta desplegar el hub de venta. | Al menos 1.000 personas verificadas **y** una multifirma de tesorería activa |
| **Apuestas y validadores** | Las apuestas y la participación de validadores se abren más allá del proyecto. | Después de mainnet |

No se prometen fechas. Cada etapa comienza cuando se cumple su condición.

---

## 8. Equipo y financiación

- **Anónimo por elección.** Un pequeño equipo. Publicamos trabajo, código y reglas, no caras.
- **Auto-financiado.** Sin dinero de capitales de riesgo. Sin asignaciones de inversores. Sin ronda privada.
- **Las mismas reglas para todos.** La parte del equipo del 15% se devenga: 0% en el lanzamiento, acantilado de 6 meses, luego 18 meses lineales (24 meses en total). No hay línea de equipo en la división de comisiones de red.

---

## 9. Seguridad

- **Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1.** Bug bounty on every page.
- **Multifirma de tesorería.** La tesorería está controlada por el contrato multifirma 2 de 3 propio de People en la red People, creado antes de mainnet; las direcciones de los firmantes se publicarán.
- **Direcciones publicadas.** Las direcciones de contrato de venta, devengo y liquidez se publicarán en el lanzamiento de mainnet — sin marcadores de posición.
- **Defensa contra bots.** Verificación de humanos, límites por dispositivo e IP, límites de puntos diarios y recuperación de bots.
- **Componentes de construcción probados.** Los contratos sin código se ensamblan a partir de plantillas de OpenZeppelin.

---

## 10. Riesgos y descargo de responsabilidad

- **Sin promesa de ingresos.** PPL, puntos y recompensas no son un producto de inversión. Nada aquí promete ganancias, rendimiento o retornos.
- **Los precios pueden caer a cero.** Los precios de los tokens pueden subir, bajar o caer a cero.
- **Testnet no es mainnet.** Los tokens y saldos de testnet no tienen valor. Los puntos son un registro de actividad, no una garantía de pago.
- **Todo es preliminar.** Los números, horarios y reglas pueden cambiar antes de mainnet y están sujetos a gobernanza comunitaria.
- **Riesgo tecnológico.** El software puede tener errores. Una auditoría reduce el riesgo; no lo elimina.
- **Regulación.** Las reglas varían por país y pueden cambiar. Los parámetros de venta de PPL están en `/buy` (curva desde **$0.005** por PPL); las compras siguen desactivadas hasta desplegar el hub. No hay KYC ni comprobaciones de elegibilidad en este sitio.
- **Haz tu propia investigación.** Este documento de visión es información, no asesoramiento financiero, legal o fiscal.

---

## Cómo somos diferentes

Solo hechos verificables públicos sobre otras redes. Fuentes a continuación.

| | Ethereum | Solana | People |
|---|---|---|---|
| Comisiones quemadas | La comisión base se quema ¹ | El 50% de la comisión base se quema ² | **0% quemado** |
| Quién recibe las comisiones | Los validadores obtienen la comisión prioritaria (propina) ¹ | Los validadores obtienen el 50% de la comisión base y el 100% de la comisión prioritaria ² | **Validadores 30 · Comunidad 25 · Tesorería 20 · Liquidez 10 · Crecimiento 15** |
| Financiación inicial | Venta pública de ether, 2014 (42 días, pagada en BTC) ³ | Serie A de 20 millones de dólares liderada por Multicoin Capital (2019); los inversores recibieron tokens SOL ⁴ | **Auto-financiado. Sin capitales de riesgo, sin asignación de inversores** |
| Creación de cuenta | Crear una cuenta no cuesta nada; sin verificación de identidad ⁵ | No es un requisito de protocolo | **Recompensas solo para humanos verificados** |
| Participación comunitaria de nuevo token | No es una regla de protocolo | No es una regla de protocolo | **10% de cada token lanzado** |

1. ethereum.org — Gas y comisiones: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Comisiones: https://solana.com/docs/core/fees
3. ethereum.org — Historial (venta de Ether 2014): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana
5. ethereum.org — Cuentas: https://ethereum.org/en/developers/docs/accounts/

*Fuentes verificadas en octubre de 2026. "No es una regla de protocolo/requisito" significa que la documentación citada no describe tal regla. Esto compara opciones de diseño, no calidad.*

---

## Enlaces

- Sitio web: https://peopleblockchain.network
- Un Millón de Fundadores: https://peopleblockchain.network/founders
- Documento de visión: https://peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### Qué cambió en la v1.1

- La parte comunitaria de un token nuevo es el **10%** del suministro, asignado al lanzamiento.
- El vesting del equipo es **0% al lanzamiento, un cliff de 6 meses y luego 18 meses lineales** (24 meses en total).
- Comisiones de lanzamiento: el plan aprobado es un importe fijo de **1 USD por lanzamiento de token y 2 USD por mint de NFT**, pagadero en PPL, USDT o USDC, con un 20% de descuento al pagar en PPL a un precio TWAP; las fábricas desplegadas aún cobran una comisión fija en PPL.
- La **venta comunitaria de PPL** usa la curva exponencial publicada en `/buy` (inicio **$0.005** por PPL; precios y límites públicos; la compra sigue desactivada hasta el hub). No hay KYC ni comprobaciones de elegibilidad en este sitio.
- Seguridad: **Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1**; bug bounty on every page.
- El multisig del tesoro es **2 de 3** y se crea antes de mainnet.
- Si la curva de un token no se agota en **180 días** desde el lanzamiento, cualquiera puede finalizarla y los tokens no vendidos van al pool comunitario de ese token. Una curva agotada pasa a liquidez como antes. (Activo en testnet.)
- La venta de PPL, una vez abierta, dura hasta que se vendan todos los PPL o durante **24 meses**, lo que ocurra primero. El plazo es fijo y no se prorrogará. Después cualquiera puede finalizarla; los PPL no vendidos van al fondo comunitario y no hay reembolsos. Hasta entonces, los PPL no vendidos están en el multisig del proyecto y el equipo no los toca.
