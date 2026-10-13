# Web3Auth setup (People Wallet)

**Status:** IMPLEMENTED. Production uses the owner **Sapphire Mainnet** Client ID baked into `web3auth-config.ts` (overridable via `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`). Optional Vercel env: `NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_mainnet`.

**Copy note:** Web3Auth **TSS/MPC** is Enterprise-only on the owner plan. Public UI uses neutral wording (`modalExplainerMpc`): key split into parts, no seed phrase — **without** the «MPC» abbreviation.

## Why Web3Auth (not Privy)

Web3Auth provides social/email wallet creation on Sapphire with a known free/base tier. Privy is simpler but was not requested. Legacy **cloud vault** remains for **address preservation** when an existing vault address differs from a new Web3Auth-derived address.

## Owner checklist (Sapphire Mainnet)

1. Open **https://dashboard.web3auth.io** and sign in.
2. **Create Project** → Sapphire **Mainnet** (production domains).
3. Whitelist: `https://www.peopleblockchain.network`, `https://peopleblockchain.network` (Mainnet does **not** allow `localhost`).
4. Enable **Google** and other social logins as needed.
5. Optional Vercel Production env (override baked-in default):
   - `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
   - `NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_mainnet`
6. Redeploy. Web3Auth explainer copy appears when a Client ID is active (default in code counts).

## Mobile sign-in (redirect mode)

Desktop uses the Web3Auth popup. On phones (Android Chrome, iOS Safari) the adapter runs in
**redirect** mode: the page navigates to Google/Web3Auth and returns to `/login`, where the
panel resumes the session. Owner dashboard requirements:

- Whitelist `https://peopleblockchain.network` and `https://www.peopleblockchain.network`
  (Web3Auth whitelists by origin; `/login` is covered). A redirect to a non-whitelisted origin
  fails on the Web3Auth side and never returns.
- The Google connection must be enabled for the project, and the project's Sapphire network must
  match `NEXT_PUBLIC_WEB3AUTH_NETWORK` (default `sapphire_mainnet`).
- Every step has a watchdog: init, the mobile redirect start and post-login steps 30 s, the
  desktop popup 120 s (it includes the time a person spends in the Google window). A timeout
  shows an error with Retry.

Return page (`src/lib/web3auth-redirect-resume.ts`):

- The resume starts when the URL carries the Web3Auth result (`b64Params` / `sessionId`, read
  before the SDK strips it) **or** the `sessionStorage` marker is present, so a lost marker
  (www ↔ apex hop, cleared storage) no longer leaves the page idle.
- It waits up to 5 s for the SDK `connected` event instead of reading `connected` once.
- After `signIn("web3auth")` it re-reads `/api/auth/session` (`no-store`, short backoff) until
  the new cookie is visible.
- Only one mounted form resumes (marker is taken, run is single-flight). Partner vault sync no
  longer blocks the UI.
- On success it navigates with `location.replace` to the page the sign-in started on; if that was
  `/login`, to its safe `callbackUrl`, else `/wallet`. The header picks the wallet up through
  `CloudWalletSessionBridge`.
- The desktop popup path ends the same way: once the outcome is `connected` it runs the same
  navigation, so `/login` never keeps the panel over a finished sign-in (it has no client-side
  redirect of its own — `SignedInRedirect` only runs at page load). On any page other than
  `/login` the target is the current path, so the wallet modal just closes in place.

## Runtime behavior

| Client ID | Wallet sign-in | Modal copy |
| --- | --- | --- |
| **Active** (env or default) | Web3Auth Google / email passwordless → Auth.js `web3auth` | `modalExplainerMpc` (neutral split-key wording) |
| **Disabled** (empty env + remove default in code) | Auth.js Google / Resend + cloud vault | `modalExplainer` (encrypted vault) |

### Existing cloud-vault users

After Web3Auth login, if `user_wallet_vault` already has an address **different** from the new derived address, the modal shows **Keep my existing wallet** so partner `walletAddress` stays intact.

## Local `.env.local` (devnet project only)

```env
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=YOUR_DEVNET_CLIENT_ID
NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_devnet
```

Mainnet Client ID cannot whitelist localhost; use a separate Devnet project for local UI testing.
