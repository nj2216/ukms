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
};

export default function DashboardPage() {
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
  return (
    <>
      <PageHeader eyebrow="Your workspace" title="Overview" description="A live view of your inventory operations and the work that needs attention." />
      {error && <div className="feedback feedback-error" role="alert">{error}</div>}
      {!data && !error ? <LoadingState label="Loading your operational overview…" /> : data && (
        <>
          <div className="metric-grid">
            <article className="metric-card"><span>Active ingredients</span><strong>{data.metrics.ingredients}</strong><small>In the institution catalog</small><Link href="/inventory/ingredients">View ingredients →</Link></article>
            <article className="metric-card"><span>Stores</span><strong>{data.metrics.stores}</strong><small>In your authorized scope</small><Link href="/inventory/stores">Manage stores →</Link></article>
            <article className="metric-card"><span>Stock positions</span><strong>{data.metrics.stockPositions}</strong><small>Across authorized stores</small><Link href="/inventory">View inventory →</Link></article>
            <article className={`metric-card${data.metrics.reorderAlerts ? " metric-warning" : ""}`}><span>Reorder alerts</span><strong>{data.metrics.reorderAlerts}</strong><small>At or below configured reorder level</small><Link href="/inventory">Review alerts →</Link></article>
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
          <Panel title="Available workflows" description="Only supported, connected operations are enabled in this release.">
            <div className="workflow-next">
              <Link href="/inventory/movements"><span className="workflow-step">01</span><span><strong>Record a stock movement</strong><small>Receive stock, issue it to a kitchen, record waste, or adjust a balance.</small></span><span>→</span></Link>
              <Link href="/inventory/ingredients"><span className="workflow-step">02</span><span><strong>Maintain the ingredient catalog</strong><small>Manage ingredient names, units, and reorder levels.</small></span><span>→</span></Link>
              <Link href="/inventory/stores"><span className="workflow-step">03</span><span><strong>Review store locations</strong><small>See which authorized stores hold tracked stock.</small></span><span>→</span></Link>
            </div>
            <p className="dashboard-footnote"><StatusBadge tone="warning">Not available yet</StatusBadge> Menus, recipes, batches, expiry tracking, transfers, purchasing, production, and finance workflows are not implemented. No placeholder records or metrics are shown.</p>
          </Panel>
        </>
      )}
    </>
  );
}
