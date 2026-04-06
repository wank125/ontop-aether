'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarNav } from '@/components/sidebar-nav';
import { TopBar } from '@/components/top-bar';
import { useAuth } from '@/lib/auth';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const isAuthPage = pathname === '/login';

  useEffect(() => {
    if (!loading && !user && !isAuthPage) {
      router.replace('/login');
    }
  }, [loading, user, isAuthPage, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (isAuthPage) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <SidebarNav />
      <main className="ml-64 min-h-screen">
        <TopBar />
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
