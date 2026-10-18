import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../PageMeta.js";
import { usePrefs } from "../PrefsContext.js";
import { showDevnetTools } from "../networkEnv.js";
import { useLive } from "../LiveContext.js";

// Swagger UI is the one asset this app loads from a third-party origin. Pin the exact
// version and verify the bytes with SRI so a compromised/altered unpkg response is
// refused by the browser instead of executing in the wallet's own origin.
const SWAGGER_UI_VERSION = "5.17.14";
const SWAGGER_UI_CDN = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
const SWAGGER_UI_CSS_INTEGRITY =
  "sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn";
const SWAGGER_UI_JS_INTEGRITY =
  "sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep";

const endpoints = [
  "GET /health",
  "GET /health/details",
  "GET /metrics",
  "GET /openapi.yaml",
  "GET /chain/head",
  "GET /snapshot",
  "GET /blocks?limit&offset|cursor",
  "GET /blocks/:height",
  "GET /transactions?limit&offset|cursor",
  "GET /transactions/:id",
  "GET /search?q=",
  "GET /address/:address",
  "GET /address/:address/transactions",
  "GET /accounts?limit&offset",
  "GET /chain/config",
  "GET /validators",
  "GET /rewards/latest",
  "GET /rewards/history?limit=50",
  "GET /governance/proposals",
  "WS /ws",
  "POST /tx",
  "POST /bootstrap",
  "POST /faucet/fund",
  "POST /security/report"
];

export function DocsPage() {
  const { t } = usePrefs();
  const { metrics } = useLive();
  const swaggerRef = useRef<HTMLDivElement>(null);
  const isDevnet = showDevnetTools(metrics?.chainId);

  useEffect(() => {
    const host = swaggerRef.current;
    if (!host) {
      return;
    }
    let cancelled = false;

    async function mountSwagger() {
      const existingCss = document.getElementById("swagger-ui-css");
      if (!existingCss) {
        const link = document.createElement("link");
        link.id = "swagger-ui-css";
        link.rel = "stylesheet";
        link.href = `${SWAGGER_UI_CDN}/swagger-ui.css`;
        link.integrity = SWAGGER_UI_CSS_INTEGRITY;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      }

      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById("swagger-ui-script") as HTMLScriptElement | null;
        if (existing && (window as unknown as { SwaggerUIBundle?: unknown }).SwaggerUIBundle) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.id = "swagger-ui-script";
        script.src = `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`;
        script.integrity = SWAGGER_UI_JS_INTEGRITY;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("swagger_load_failed"));
        document.body.appendChild(script);
      });

      if (cancelled || !host) {
        return;
      }
      const SwaggerUIBundle = (window as unknown as {
        SwaggerUIBundle: (opts: Record<string, unknown>) => void;
      }).SwaggerUIBundle;
      host.innerHTML = "";
      SwaggerUIBundle({
        domNode: host,
        url: "/api/openapi.yaml",
        deepLinking: true,
        docExpansion: "list",
        defaultModelsExpandDepth: -1
      });
    }

    void mountSwagger().catch(() => {
      if (host) {
        host.innerHTML = `<p class="wallet-hint">${t.docsSwaggerFallback}</p>`;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [t.docsSwaggerFallback]);

  return (
    <>
      <PageMeta title={t.docsPortalTitle} description={t.docsPortalDescription} />
      <section className="card page-header">
        <h1>{t.docsPortalTitle}</h1>
        <p className="lead">{t.docsPortalDescription}</p>
        <p className="wallet-hint">{t.consensusNote}</p>
        <div className="link-row">
          <a className="cta button-link" href="/api/openapi.yaml" target="_blank" rel="noreferrer">
            {t.docsOpenapiLink}
          </a>
          <Link to="/status" className="ghost button-link">
            {t.statusNav}
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>{t.docsQuickstartTitle}</h2>
        <ol>
          <li>{t.docsQuickstart1}</li>
          <li>{t.docsQuickstart2}</li>
          <li>{t.docsQuickstart3}</li>
          <li>{t.docsQuickstart4}</li>
        </ol>
        <pre>{`npm install @people/sdk
# or use workspace package packages/sdk`}</pre>
        <pre>{`import { PeopleClient, generateKeyPair } from "@people/sdk";

const client = new PeopleClient({ baseUrl: "/api" }); // via Vite proxy in web
const key = generateKeyPair();
${isDevnet ? "await client.fundFromFaucet(key.address, 200);\n" : ""}const account = await client.getAddress(key.address);
await client.sendTransfer(key.privateKey, {
  to: "0xrecipient...",
  amount: 10,
  nonce: account.nonce,
  memo: "hello"
});`}</pre>
      </section>

      {isDevnet && (
        <section className="card">
          <h2>{t.docsTestnetCredsTitle}</h2>
          <p className="wallet-hint">{t.docsTestnetCredsHint}</p>
          <ul className="log-list">
            <li>
              API: <code>/api</code> (proxied) · WS: <code>/ws</code>
            </li>
            <li>
              Chain: <code>{metrics?.chainId ?? "people-devnet"}</code>
            </li>
            <li>{t.docsTestnetFaucet}</li>
            <li>{t.docsTestnetToken}</li>
          </ul>
        </section>
      )}

      <section className="card">
        <h2>{t.docsSdkTitle}</h2>
        <p className="wallet-hint">{t.docsSdkHint}</p>
        <pre>{`import { PeopleClient, generateKeyPair } from "@people/sdk";

const client = new PeopleClient({
  baseUrl: "http://localhost:4001",
  apiToken: process.env.DEV_API_TOKEN // optional for faucet/admin
});

const key = generateKeyPair();
await client.joinValidator(key.privateKey, 120, "light", 0, "0xReferrer...");
await client.sendBatchTransfer(key.privateKey, {
  nonce: 1,
  recipients: [
    { to: "0xaaa...", amount: 5, memo: "Salary" },
    { to: "0xbbb...", amount: 3, memo: "Bonus" }
  ]
});
const history = await client.getRewardHistory(20);`}</pre>
      </section>

      <section className="card">
        <h2>{t.docsOpenapiInteractive}</h2>
        <p className="wallet-hint">{t.docsOpenapiHint}</p>
        <div ref={swaggerRef} className="swagger-host" />
      </section>

      <section className="card">
        <h2>HTTP API</h2>
        <ul>
          {endpoints.map((endpoint) => (
            <li key={endpoint}>
              <code>{endpoint}</code>
            </li>
          ))}
        </ul>
        <h3>Auth</h3>
        <p className="wallet-hint">
          In production set <code>NODE_ENV=production</code> and optionally <code>DEV_API_TOKEN</code>. Pass token via{" "}
          <code>x-api-token</code> for faucet/admin endpoints.
        </p>
      </section>
    </>
  );
}
