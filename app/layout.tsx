import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "抱石分析 · AI Coach",
  description: "上传攀爬视频，获取专业、克制的 AI 动作分析与改进建议",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="no-print mt-auto border-t border-[var(--spa-border)] bg-[var(--spa-elevated)] px-5 py-6 text-center text-[11px] leading-relaxed text-[var(--spa-text-muted)]">
          <p>
            本服务仅供训练参考，不构成医疗、康复或现场保护建议；请在安全环境下攀爬并自行承担风险。
          </p>
          <p className="mt-2">
            For training reference only; not medical, rehab, or on-the-spot
            safety advice. Climb responsibly and at your own risk.
          </p>
        </footer>
      </body>
    </html>
  );
}
