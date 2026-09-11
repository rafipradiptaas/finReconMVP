import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth';
import { signOut } from '@/lib/actions/auth';
import { SidebarNav } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/types/domain';

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const session = await getSessionContext();

  if (!session) {
    // proxy.ts already blocks anonymous requests, so getting here means the
    // user is signed in but has no profile yet.
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) redirect('/login');

    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-lg font-semibold">Akun belum ditautkan ke organisasi</h1>
          <p className="text-muted-foreground text-sm">
            Minta admin menautkan akun Anda sebelum menggunakan aplikasi.
          </p>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Keluar
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-1">
      <aside className="bg-muted/30 flex w-60 shrink-0 flex-col justify-between border-r p-4">
        <div className="space-y-6">
          <div className="px-3">
            <p className="font-semibold">FinRecon AI</p>
          </div>
          <SidebarNav />
        </div>
        <div className="space-y-3 px-3">
          <div className="space-y-1">
            <p className="truncate text-sm font-medium">{session.fullName ?? 'Pengguna'}</p>
            <Badge variant="secondary">{ROLE_LABELS[session.role]}</Badge>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Keluar
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
