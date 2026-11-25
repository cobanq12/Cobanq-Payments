import { ArrowLeftRight, Building2, FileSpreadsheet, FileText, LayoutDashboard, Send, Settings, Users, type LucideIcon } from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
  { to: '/payments', label: 'Payments', icon: Send, end: false },
  { to: '/convert', label: 'Convert', icon: ArrowLeftRight },
  { to: '/beneficiaries', label: 'Beneficiaries', icon: Users },
  { to: '/payments/bulk', label: 'Bulk payments', icon: FileSpreadsheet },
  { to: '/statements', label: 'Statements', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Bottom navigation on mobile shows the four built areas; the rest sit under "More". */
export const MOBILE_PRIMARY = ['/payments', '/convert', '/beneficiaries', '/payments/bulk'];
