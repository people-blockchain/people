import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PrefsProvider } from "./PrefsContext.js";
import { WalletProvider } from "./WalletContext.js";
import { DeviceVaultProvider } from "./DeviceVaultContext.js";
import { LiveProvider } from "./LiveContext.js";
import { NotifyProvider } from "./NotifyContext.js";
import { SiteLayout } from "./SiteLayout.js";
import { LandingPage } from "./pages/LandingPage.js";
import { PricingPage } from "./pages/PricingPage.js";
import { RoadmapPage } from "./pages/RoadmapPage.js";
import { ValidatorsPage } from "./pages/ValidatorsPage.js";
import { ExplorerPage } from "./pages/ExplorerPage.js";
import { BlockPage, TxPage } from "./pages/ExplorerPages.js";
import { SearchPage } from "./pages/SearchPage.js";
import { AddressPage } from "./pages/AddressPage.js";
import { WalletPage } from "./pages/WalletPage.js";
import { StakingPage } from "./pages/StakingPage.js";
import { GovernancePage } from "./pages/GovernancePage.js";
import { DocsPage } from "./pages/DocsPage.js";
import { LightPage } from "./pages/LightPage.js";
import { StatusPage } from "./pages/StatusPage.js";
import { ValidatorPage } from "./pages/ValidatorPage.js";

export function App() {
  return (
    <BrowserRouter>
      <PrefsProvider>
        <NotifyProvider>
          <LiveProvider>
            <WalletProvider>
              <DeviceVaultProvider>
                <Routes>
                  <Route element={<SiteLayout />}>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/wallet" element={<WalletPage />} />
                    <Route path="/validators" element={<ValidatorsPage />} />
                    <Route path="/validator/:address" element={<ValidatorPage />} />
                    <Route path="/staking" element={<StakingPage />} />
                    <Route path="/earn" element={<StakingPage />} />
                    <Route path="/governance" element={<GovernancePage />} />
                    <Route path="/light" element={<LightPage />} />
                    <Route path="/status" element={<StatusPage />} />
                    <Route path="/docs" element={<DocsPage />} />
                    <Route path="/explorer" element={<ExplorerPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/roadmap" element={<RoadmapPage />} />
                    <Route path="/block/:height" element={<BlockPage />} />
                    <Route path="/tx/:id" element={<TxPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/address/:address" element={<AddressPage />} />
                  </Route>
                </Routes>
              </DeviceVaultProvider>
            </WalletProvider>
          </LiveProvider>
        </NotifyProvider>
      </PrefsProvider>
    </BrowserRouter>
  );
}
