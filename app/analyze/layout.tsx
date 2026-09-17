import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "动作解析",
  description:
    "上传抱石攀爬片段，选择难度与爬升高度，获取 AI 动作分析与训练历史记录。",
};

export default function AnalyzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
