import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3C 售后多 Agent 回复决策系统",
  description: "内容电商 3C 售后多 Agent 回复决策系统高保真 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
