import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { AppLayout } from '@/components/app-layout';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: {
    default: '天织 · 语义平台',
    template: '%s | 天织',
  },
  description: '天织语义平台 - 虚拟知识图谱管理与语义数据查询',
  keywords: [
    '天织',
    'Ontop',
    'OBDA',
    'SPARQL',
    'RDF',
    '知识图谱',
    '语义查询',
  ],
  authors: [{ name: '天织语义团队' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">
        {isDev && <Inspector />}
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
