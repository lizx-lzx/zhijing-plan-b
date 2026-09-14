import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const origin = process.env.ZH_PUBLIC_ORIGIN || "http://localhost:3100";

  return {
    title: "知径 Plan B｜独立开发副本",
    description: "通过一次个人学习适配，把文章重新组织成更适合你的学习路径。",
    openGraph: {
      title: "知径｜先认识你，再为你讲知识",
      description: "一套会先理解你的个性化学习平台。",
      images: [
        { url: `${origin}${basePath}/og.png`, width: 1672, height: 941 },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "知径｜先认识你，再为你讲知识",
      description: "一套会先理解你的个性化学习平台。",
      images: [`${origin}${basePath}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
