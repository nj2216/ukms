"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, formatDateTime, LoadingState, PageHeader, Panel, StatusBadge } from "@/components/workspace-primitives";

type DashboardData = {
  metrics: {
    stockPositions: number;
    reorderAlerts: number;
    ingredients: number;
    stores: number;
    movements: number;
    expiredBatches: number;
    expiringBatches: number;
  };
  lowStock: {
    id: string;
    onHand: string;
    campusName: string;
    storeName: string;
    ingredientName: string;
    unit: string;
    reorderLevel: string;
  }[];
  recentMovements: {
    id: string;
    kind: string;
    quantity: string;
    createdAt: string;
    ingredient: { name: string; unit: string };
    store: { name: string; campus: { name: string } };
  }[];
  expiryAttention: {
    id: string;
    batchCode: string;
    expiryDate: string;
    remainingQuantity: string;
    daysUntilExpiry: number;
    store: { name: string; campus: { name: string } };
    ingredient: { name: string; unit: string };
  }[];
};

export default function DashboardPage({ role }: { role: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/dashboard", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load dashboard data.");
      return result as DashboardData;
    }).then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load dashboard.");
    });
    return () => { active = false; };
  }, []);

  const lowStock = data?.lowStock ?? [];
  const workflows = role === "INSTITUTION_ADMIN" || role === "CAMPUS_MANAGER"
    ? [
        { href: "/kitchen/menus", title: "Plan a meal", detail: "Calculate ingredient needs from a published menu." },
        { href: "/operations/production", title: "Record production", detail: "Issue ingredients and track servings." },
        { href: "/procurement", title: "Review procurement", detail: "Move requests through approval and receiving." },
        { href: "/finance", title: "Manage budgets", detail: "Reconcile invoices and track actual spend." },
      ]
    : role === "KITCHEN_STAFF"
      ? [
          { href: "/kitchen/menus", title: "Plan a meal", detail: "Calculate stock-backed ingredient requirements." },
          { href: "/operations/production", title: "Record production", detail: "Issue ingredients and track servings." },
          { href: "/operations/waste", title: "Record waste", detail: "Account for raw ingredients and leftovers." },
          { href: "/procurement", title: "Create a purchase request", detail: "Send stock shortages into procurement." },
        ]
      : role === "STOREKEEPER"
        ? [
            { href: "/inventory/movements", title: "Receive or issue stock", detail: "Update batches and the movement ledger." },
            { href: "/inventory/expiry", title: "Review expiry alerts", detail: "Prioritize expiring and expired batches." },
            { href: "/inventory/transfers", title: "Allocate stock", detail: "Complete a scoped store-to-store transfer." },
            { href: "/operations/waste", title: "Record raw waste", detail: "Deduct ingredient loss from stock." },
          ]
        : role === "PROCUREMENT_OFFICER"
          ? [
              { href: "/procurement", title: "Review purchase requests", detail: "Approve eligible requests and manage orders." },
              { href: "/procurement/quotes", title: "Compare quotations", detail: "Award a complete supplier offer to an order." },
              { href: "/procurement/suppliers", title: "Manage suppliers", detail: "Maintain the institution supplier directory." },
              { href: "/reports", title: "Review analytics", detail: "Inspect supplier fulfillment and demand signals." },
            ]
          : role === "FINANCE_OFFICER"
            ? [
                { href: "/finance", title: "Manage budgets and invoices", detail: "Reconcile received orders and monitor spend." },
                { href: "/reports", title: "Review financial reports", detail: "Compare reconciled spend and campus results." },
                { href: "/inventory", title: "Review inventory", detail: "Inspect scoped stock balances." },
              ]
            : [
                { href: "/reports", title: "Review reports", detail: "Inspect scoped operational and financial summaries." },
                { href: "/inventory", title: "Review inventory", detail: "Inspect scoped stock balances." },
              ];
  return (
    <>
      <PageHeader eyebrow="Your workspace" title="Overview" description="Live operational metrics, stock alerts, and next actions for your role." />
      {error && <div className="feedback feedback-error" role="alert">{error}</div>}
      {!data && !error ? <LoadingState label="Loading your operational overview…" /> : data && (
        <>
          <div className="metric-grid">
            <article className="metric-card"><span>Active ingredients</span><strong>{data.metrics.ingredients}</strong><small>In the institution catalog</small><Link href="/inventory/ingredients">View ingredients →</Link></article>
            <article className="metric-card"><span>Stores</span><strong>{data.metrics.stores}</strong><small>In your authorized scope</small><Link href="/inventory/stores">Manage stores →</Link></article>
            <article className="metric-card"><span>Stock positions</span><strong>{data.metrics.stockPositions}</strong><small>Across authorized stores</small><Link href="/inventory">View inventory →</Link></article>
            <article className={`metric-card${data.metrics.reorderAlerts ? " metric-warning" : ""}`}><span>Reorder alerts</span><strong>{data.metrics.reorderAlerts}</strong><small>At or below configured reorder level</small><Link href="/inventory">Review alerts →</Link></article>
            <article className={`metric-card${data.metrics.expiredBatches + data.metrics.expiringBatches ? " metric-warning" : ""}`}><span>Expiry alerts</span><strong>{data.metrics.expiredBatches + data.metrics.expiringBatches}</strong><small>{data.metrics.expiredBatches} expired · {data.metrics.expiringBatches} within 30 days</small><Link href="/inventory/expiry">Review batches →</Link></article>
          </div>
          <div className="dashboard-columns">
            <Panel title="Stock needing attention" description="Real balances compared with each ingredient’s reorder level." action={<Link className="text-link" href="/inventory">All inventory →</Link>}>
              {data.metrics.reorderAlerts === 0 ? <EmptyState title="No reorder alerts" >Stock is at or above its configured reorder level.</EmptyState> : (
                <div className="alert-list">{lowStock.map((balance) => <div className="alert-row" key={balance.id}><span className="alert-icon">!</span><span><strong>{balance.ingredientName}</strong><small>{balance.campusName} · {balance.storeName}</small></span><span className="alert-quantity">{balance.onHand} {balance.unit}<small>reorder at {balance.reorderLevel}</small></span></div>)}</div>
              )}
            </Panel>
            <Panel title="Recent stock activity" description="Latest entries in the immutable stock ledger." action={<Link className="text-link" href="/inventory/movements">Movement history →</Link>}>
              {data.recentMovements.length === 0 ? <EmptyState title="No activity recorded" >Record a stock receipt or issue to begin the ledger.</EmptyState> : (
                <div className="activity-list">{data.recentMovements.map((movement) => <div className="activity-row" key={movement.id}><span className="activity-dot" /><span><strong>{movement.ingredient.name} · {movement.kind.toLowerCase()}</strong><small>{movement.store.campus.name} · {movement.store.name} · {formatDateTime(movement.createdAt)}</small></span><b>{movement.quantity} {movement.ingredient.unit}</b></div>)}</div>
              )}
            </Panel>
          </div>
          <Panel title="Expiry attention" description="Expired and soon-to-expire batches with remaining stock." action={<Link className="text-link" href="/inventory/expiry">Expiry tracking →</Link>}>
            {data.expiryAttention.length === 0 ? <EmptyState title="No expiry alerts">No on-hand batches are expired or expiring within 30 days.</EmptyState> : (
              <div className="alert-list">{data.expiryAttention.map((batch) => <div className="alert-row" key={batch.id}><span className="alert-icon">!</span><span><strong>{batch.ingredient.name} · {batch.batchCode}</strong><small>{batch.store.campus.name} · {batch.store.name} · expires {batch.expiryDate.slice(0, 10)}</small></span><StatusBadge tone="warning">{batch.daysUntilExpiry < 0 ? `${Math.abs(batch.daysUntilExpiry)} days expired` : batch.daysUntilExpiry === 0 ? "Expires today" : `${batch.daysUntilExpiry} days left`}</StatusBadge></div>)}</div>
            )}
          </Panel>
          <Panel title="Quick actions" description="Continue the operational workflow from the tasks available to your role.">
            <div className="workflow-next">
              {workflows.map((workflow, index) => (
                <Link href={workflow.href} key={workflow.href}>
                  <span className="workflow-step">{String(index + 1).padStart(2, "0")}</span>
                  <span><strong>{workflow.title}</strong><small>{workflow.detail}</small></span>
                  <span>→</span>
                </Link>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
