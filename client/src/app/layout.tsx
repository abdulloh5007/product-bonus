import type { Metadata } from "next";
import "./globals.css";
import Script from 'next/script';

export const metadata: Metadata = {
  title: "Eksklyuziv sovg'a | Cheklangan taklif",
  description: "Cheklangan taklif – faqat bugungi birinchi 100 ta tashrif buyuruvchi uchun. Xarid talab qilinmaydi. Vaqt tugashidan oldin sovg'angizni oling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
