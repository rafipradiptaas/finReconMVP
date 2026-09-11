'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Every route in product doc section 13. */
export const NAV_ITEMS = [
  { href: '/', label: 'Ringkasan' },
  { href: '/documents', label: 'Dokumen' },
  { href: '/matches', label: 'Pencocokan' },
  { href: '/vendors', label: 'Vendor' },
  { href: '/purchase-orders', label: 'Purchase Order' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/chat', label: 'Chatbot' },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent/50',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
