import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { AnalyzePage } from "@/pages/AnalyzePage";
import { AnalysisPage } from "@/pages/AnalysisPage";
import { ProgressPage } from "@/pages/ProgressPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/analyze" element={<AnalyzePage />} />
        <Route path="/analysis/:id" element={<AnalysisPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="no-print mt-auto border-t-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-5 py-6 text-center crux-mono text-[10px] leading-relaxed text-[var(--crux-text-muted)]">
        <p>
          本服务仅供训练参考，不构成医疗、康复或现场保护建议；请在安全环境下攀爬并自行承担风险。
        </p>
        <p className="mt-2">
          For training reference only; not medical, rehab, or on-the-spot safety
          advice. Climb responsibly and at your own risk.
        </p>
      </footer>
    </BrowserRouter>
  );
}
