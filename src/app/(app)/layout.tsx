'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, Topbar } from '@/components/shell';
import { SessionProvider, useSession } from '@/components/session-provider';
import { ToastProvider, Loading } from '@/components/ui';

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading) return <Loading label="StudyBase laden…" />;
  if (!user) return null;
  return children;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <Gate>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
            </div>
          </div>
        </Gate>
      </ToastProvider>
    </SessionProvider>
  );
}
