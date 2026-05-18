import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 抱石分析教练",
  description: "上传攀爬视频，获取 AI 抱石动作分析与改进建议",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
