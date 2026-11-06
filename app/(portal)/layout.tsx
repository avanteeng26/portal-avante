'use client';
import { SessaoProvider } from '@/components/Sessao';
import { Shell } from '@/components/Shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessaoProvider>
      <Shell>{children}</Shell>
    </SessaoProvider>
  );
}
