import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CRUX 抱石 · AI 攀爬动作解析",
    template: "%s · CRUX 抱石",
  },
  description:
    "上传抱石攀爬视频，获得带时间戳的 AI 动作分析与改进建议。记录难度、爬升与训练历史，适合岩馆与居家抱石练习。",
  keywords: [
    "抱石",
    "攀岩",
    "bouldering",
    "动作分析",
    "AI 教练",
    "攀爬视频分析",
    "岩馆训练",
    "CRUX",
  ],
  authors: [{ name: "CRUX 抱石" }],
  creator: "CRUX 抱石",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: "CRUX 抱石",
    title: "CRUX 抱石 · AI 攀爬动作解析",
    description:
      "上传抱石视频，获取专业 AI 动作反馈，记录难度与爬升。",
    images: [
      {
        url: "/hero-climb.jpg",
        width: 1200,
        height: 630,
        alt: "抱石攀岩训练",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CRUX 抱石 · AI 攀爬动作解析",
    description: "上传抱石视频，获取 AI 动作分析与改进建议。",
    images: ["/hero-climb.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      data-theme="light"
      className={`${dmSans.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("crux-theme");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <footer className="no-print mt-auto border-t-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-5 py-6 text-center crux-mono text-[10px] leading-relaxed text-[var(--crux-text-muted)]">
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
