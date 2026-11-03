"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type UserInfo = {
  name: string;
  email: string;
  role: string;
  institutionName: string;
  campusName: string | null;
};

const navigation = [
  {
    label: "Workspace",
    items: [{ href: "/dashboard", label: "Overview", icon: "grid" }],
  },
  {
    label: "Inventory & stock",
    items: [
      { href: "/inventory", label: "Stock overview", icon: "layers" },
      { href: "/inventory/ingredients", label: "Ingredients", icon: "leaf" },
      { href: "/inventory/movements", label: "Stock movements", icon: "activity" },
      { href: "/inventory/expiry", label: "Expiry tracking", icon: "bell" },
      { href: "/inventory/stores", label: "Stores", icon: "store" },
    ],
  },
  {
    label: "Kitchen & meal planning",
    items: [
      { href: "/kitchen/menus", label: "Meal plans", icon: "grid" },
      { href: "/kitchen/recipes", label: "Recipes", icon: "leaf" },
    ],
  },
  {
    label: "Production",
    items: [
      { href: "/operations/production", label: "Production records", icon: "activity" },
      { href: "/operations/waste", label: "Leftovers & waste", icon: "bell" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { href: "/procurement", label: "Requests & orders", icon: "activity" },
      { href: "/procurement/suppliers", label: "Suppliers", icon: "store" },
      { href: "/procurement/quotes", label: "Quotations", icon: "layers" },
    ],
  },
  {
    label: "Inventory transfers",
    items: [
      { href: "/inventory/transfers", label: "Campus allocations", icon: "store" },
    ],
  },
  {
    label: "Finance & reporting",
    items: [
      { href: "/finance", label: "Budgets & invoices", icon: "activity" },
      { href: "/reports", label: "Reports & analytics", icon: "grid" },
    ],
  },
];
const navigationHrefs = navigation.flatMap((group) => group.items.map((item) => item.href));

function isPathActive(pathname: string, href: string) {
  if (pathname === href) return true;
  const activeChild = navigationHrefs.some((candidate) =>
    candidate !== href &&
    candidate.startsWith(`${href}/`) &&
    (pathname === candidate || pathname.startsWith(`${candidate}/`)),
  );
  return pathname.startsWith(`${href}/`) && !activeChild;
}

const adminNavigation = {
  label: "Administration",
  items: [
    { href: "/administration/campuses", label: "Campuses", icon: "building" },
    { href: "/administration/team", label: "Team access", icon: "users" },
    { href: "/administration/audit-log", label: "Audit log", icon: "activity" },
  ],
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    leaf: <><path d="M20 4c-8 0-13 3-13 9a7 7 0 0 0 7 7c6 0 9-5 9-13V4h-3Z" /><path d="M4 20c2-5 6-8 12-11" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    store: <><path d="M4 10v10h16V10" /><path d="M3 10 5 4h14l2 6" /><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M9 20v-6h6v6" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M11 21v-3h2v3" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? paths.grid}
    </svg>
  );
}

export default function AppShell({
  user,
  children,
}: Readonly<{ user: UserInfo; children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [inventoryAlerts, setInventoryAlerts] = useState({ lowStock: 0, expired: 0, expiring: 0 });
  const [notice, setNotice] = useState("");

  const breadcrumb = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));

  useEffect(() => {
    let active = true;
    fetch("/api/v1/dashboard", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { metrics?: { reorderAlerts: number; expiredBatches: number; expiringBatches: number } };
        if (active) setInventoryAlerts({
          lowStock: result.metrics?.reorderAlerts ?? 0,
          expired: result.metrics?.expiredBatches ?? 0,
          expiring: result.metrics?.expiringBatches ?? 0,
        });
      })
      .catch(() => {
        if (active) setNotice("Alerts could not be refreshed.");
      });
    return () => { active = false; };
  }, []);
  const inventoryAlertCount = inventoryAlerts.lowStock + inventoryAlerts.expired + inventoryAlerts.expiring;

  useEffect(() => {
    if (!sidebarOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  async function signOut() {
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed.");
      router.replace("/");
      router.refresh();
    } catch {
      setNotice("Could not sign out. Please try again.");
    }
  }

  return (
    <div className={`app-frame${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? " is-open" : ""}`} aria-label="Primary navigation" id="primary-navigation">
        <Link className="brand" href="/dashboard" onClick={() => setSidebarOpen(false)}>
          <span className="brand-mark">K</span>
          <span className="brand-copy"><strong>Kitchen OS</strong><small>Operations</small></span>
        </Link>
        <div className="tenant-switcher">
          <span className="tenant-avatar">{user.institutionName.slice(0, 1).toUpperCase()}</span>
          <span className="tenant-copy"><strong>{user.institutionName}</strong><small>{user.campusName ?? "All campuses"}</small></span>
          <span className="tenant-chevron"><Icon name="chevron" /></span>
        </div>
        <nav className="side-nav">
          {navigation
            .filter((group) => !["Kitchen & meal planning", "Production"].includes(group.label) || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"].includes(user.role))
            .filter((group) => group.label !== "Inventory transfers" || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"].includes(user.role))
            .filter((group) => group.label !== "Procurement" || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "STOREKEEPER", "PROCUREMENT_OFFICER"].includes(user.role))
            .filter((group) => group.label !== "Finance & reporting" || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER", "FINANCE_OFFICER", "AUDITOR"].includes(user.role))
            .map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items
                .filter((item) => item.href !== "/procurement/quotes" || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"].includes(user.role))
                .filter((item) => item.href !== "/finance" || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER"].includes(user.role))
                .filter((item) => item.href !== "/reports" || ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER", "FINANCE_OFFICER", "AUDITOR"].includes(user.role))
                .map((item) => (
                <Link
                  aria-label={item.label}
                  aria-current={isPathActive(pathname, item.href) ? "page" : undefined}
                  className={`nav-link${isPathActive(pathname, item.href) ? " active" : ""}`}
                  href={item.href}
                  key={item.href}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} /><span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
          {user.role === "INSTITUTION_ADMIN" && (
            <div className="nav-group">
              <p className="nav-label">{adminNavigation.label}</p>
              {adminNavigation.items.map((item) => (
                <Link
                  aria-label={item.label}
                  aria-current={isPathActive(pathname, item.href) ? "page" : undefined}
                  className={`nav-link${isPathActive(pathname, item.href) ? " active" : ""}`}
                  href={item.href}
                  key={item.href}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} /><span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>
        <button className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <Icon name="chevron" /><span>{sidebarCollapsed ? "Expand menu" : "Collapse menu"}</span>
        </button>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((value) => !value)}><Icon name={sidebarOpen ? "close" : "menu"} /></button>
          <div className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumb.map((part, index) => (
              <span key={`${part}-${index}`} aria-current={index === breadcrumb.length - 1 ? "page" : undefined}>
                {index > 0 && <span className="breadcrumb-separator">/</span>}{part}
              </span>
            ))}
          </div>
          <div className="topbar-actions">
            <div className="popover-wrap">
              <button className="icon-button notification-button" aria-label={`Notifications, ${inventoryAlertCount} inventory alerts`} aria-expanded={alertsOpen} onClick={() => { setAlertsOpen((value) => !value); setAccountOpen(false); }}>
                <Icon name="bell" />{inventoryAlertCount > 0 && <span className="notification-dot">{inventoryAlertCount > 9 ? "9+" : inventoryAlertCount}</span>}
              </button>
              {alertsOpen && <div className="popover alert-popover"><strong>Inventory alerts</strong>{inventoryAlerts.lowStock > 0 && <Link href="/inventory" onClick={() => setAlertsOpen(false)}>{inventoryAlerts.lowStock} stock position{inventoryAlerts.lowStock === 1 ? "" : "s"} at or below reorder level</Link>}{inventoryAlerts.expired > 0 && <Link href="/inventory/expiry" onClick={() => setAlertsOpen(false)}>{inventoryAlerts.expired} expired batch{inventoryAlerts.expired === 1 ? "" : "es"} with stock</Link>}{inventoryAlerts.expiring > 0 && <Link href="/inventory/expiry" onClick={() => setAlertsOpen(false)}>{inventoryAlerts.expiring} batch{inventoryAlerts.expiring === 1 ? "" : "es"} expiring within 30 days</Link>}{inventoryAlertCount === 0 && <p>No inventory alerts right now.</p>}</div>}
            </div>
            <div className="popover-wrap">
              <button className="profile-button" aria-label={`Account: ${user.name}`} aria-expanded={accountOpen} onClick={() => { setAccountOpen((value) => !value); setAlertsOpen(false); }}>
                <span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.role.replaceAll("_", " ").toLowerCase()}</small></span><Icon name="chevron" />
              </button>
              {accountOpen && <div className="popover account-popover"><strong>{user.email}</strong><button onClick={() => void signOut()}><Icon name="logout" />Sign out</button></div>}
            </div>
          </div>
        </header>
        <main className="page-content">
          {notice && <p className="inline-notice" role="status">{notice}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}
