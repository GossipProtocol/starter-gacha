import type { Metadata } from 'next';
import { AdminGate } from './ui';

export const metadata: Metadata = {
  title: 'Back of house · Thrifting Machine',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
