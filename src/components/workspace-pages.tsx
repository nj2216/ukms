"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  formatDateTime,
  LoadingState,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  TableFrame,
} from "@/components/workspace-primitives";

type Campus = { id: string; name: string; code: string };
type Store = { id: string; name: string; type: string; campus: { id: string; name: string } };
type Ingredient = { id: string; name: string; unit: string; reorderLevel: string };
type Balance = {
  id: string;
  onHand: string;
  belowReorderLevel: boolean;
  store: Store;
  ingredient: Ingredient;
};
type StockBatch = {
  id: string;
  batchCode: string;
  expiryDate: string;
  remainingQuantity: string;
  receivedQuantity: string;
  daysUntilExpiry: number;
  store: { name: string; campus: { id: string; name: string } };
  ingredient: { name: string; unit: string };
};
type Movement = {
  id: string;
  kind: string;
  quantity: string;
  note: string | null;
  createdAt: string;
  store: { name: string; campus: { name: string } };
  ingredient: { name: string; unit: string };
  batch: { batchCode: string; expiryDate: string | null } | null;
};
type Membership = {
  id: string;
  role: string;
  campus: Campus | null;
  user: { id: string; name: string; email: string; active: boolean; mustChangePassword: boolean };
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result as T;
}

function useResource<T>(url: string, refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setData(null), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestJson<T>(url).then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load records.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [url, refreshKey]);

  return { data, error, loading, reload };
}

function FormNotice({ message, error }: { message: string; error: boolean }) {
  return message ? <Notice error={error}>{message}</Notice> : null;
}

export default function InventoryPage() {
  const { data, error, loading } = useResource<{ balances: Balance[] }>("/api/v1/inventory", 0);
  const balances = data?.balances ?? [];
  const reorderCount = balances.filter((item) => item.belowReorderLevel).length;
  return (
    <>
      <PageHeader eyebrow="Inventory & stock" title="Stock overview" description="Review current quantities across the stores you are authorized to access." action={<Link className="button-primary" href="/inventory/movements">Record movement</Link>} />
      {error && <Notice error>{error}</Notice>}
      <div className="metric-grid metric-grid-compact">
        <article className="metric-card"><span>Stock positions</span><strong>{loading ? "—" : balances.length}</strong><small>Store and ingredient balances</small></article>
        <article className={`metric-card${reorderCount ? " metric-warning" : ""}`}><span>Reorder alerts</span><strong>{loading ? "—" : reorderCount}</strong><small>At or below reorder level</small></article>
        <article className="metric-card metric-link-card"><span>Next step</span><strong>Stock movement</strong><small>Receipt, issue, waste, or adjustment</small><Link href="/inventory/movements">Open movement workflow →</Link></article>
      </div>
      <Panel title="Current balances" description="Balances are maintained transactionally with each immutable stock movement." action={<Link className="text-link" href="/inventory/ingredients">Ingredient catalog →</Link>}>
        {loading ? <LoadingState /> : error ? <Notice error>{error}</Notice> : balances.length === 0 ? <EmptyState title="No stock has been recorded yet." /> : (
          <TableFrame><thead><tr><th>Ingredient</th><th>Campus and store</th><th>On hand</th><th>Reorder at</th><th>Status</th></tr></thead><tbody>
            {balances.map((balance) => <tr key={balance.id}><td><strong>{balance.ingredient.name}</strong><small>{balance.ingredient.unit}</small></td><td>{balance.store.campus.name} · {balance.store.name}</td><td>{balance.onHand} {balance.ingredient.unit}</td><td>{balance.ingredient.reorderLevel} {balance.ingredient.unit}</td><td><StatusBadge tone={balance.belowReorderLevel ? "warning" : "positive"}>{balance.belowReorderLevel ? "Reorder" : "In range"}</StatusBadge></td></tr>)}
          </tbody></TableFrame>
        )}
      </Panel>
      <div className="next-step-card"><div><strong>Continue the inventory workflow</strong><p>Receive or issue stock, then review the auditable movement history.</p></div><Link className="button-secondary" href="/inventory/movements">View stock movements</Link></div>
    </>
  );
}

export function ExpiryPage() {
  const [campusId, setCampusId] = useState("");
  const [days, setDays] = useState(30);
  const [items, setItems] = useState<StockBatch[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses", 0);
  const endpoint = `/api/v1/inventory/batches?days=${days}${campusId ? `&campusId=${encodeURIComponent(campusId)}` : ""}`;
  const { data, error, loading } = useResource<{
    batches: StockBatch[];
    expiredCount: number;
    expiringCount: number;
    nextCursor: string | null;
  }>(endpoint, 0);

  useEffect(() => {
    setItems(data?.batches ?? []);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const result = await requestJson<{ batches: StockBatch[]; nextCursor: string | null }>(`${endpoint}&cursor=${encodeURIComponent(cursor)}`);
      setItems((current) => [...current, ...result.batches]);
      setCursor(result.nextCursor);
    } catch (reason) {
      setLoadMoreError(reason instanceof Error ? reason.message : "Could not load more batches.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Inventory & stock" title="Expiry tracking" description="Prioritize expired and soon-to-expire stock by campus, store, and ingredient." action={<Link className="button-secondary" href="/inventory/movements">Record stock issue</Link>} />
      {error && <Notice error>{error}</Notice>}
      <div className="metric-grid metric-grid-compact">
        <article className={`metric-card${(data?.expiredCount ?? 0) > 0 ? " metric-warning" : ""}`}><span>Expired batches</span><strong>{loading ? "—" : data?.expiredCount ?? 0}</strong><small>On-hand lots past their expiry date</small></article>
        <article className="metric-card"><span>Expiring soon</span><strong>{loading ? "—" : data?.expiringCount ?? 0}</strong><small>Within the selected time window</small></article>
        <article className="metric-card metric-link-card"><span>Next step</span><strong>Issue eligible stock</strong><small>Stock issues consume earliest-expiring lots first</small><Link href="/inventory/movements">Open movement workflow →</Link></article>
      </div>
      <Panel title="Batches requiring attention" description="Only batches with remaining stock and an expiry date in the selected window are listed.">
        {campuses.error && <Notice error>{campuses.error}</Notice>}
        {loadMoreError && <Notice error>{loadMoreError}</Notice>}
        <div className="search-bar">
          {campuses.data?.campuses && campuses.data.campuses.length > 1 && <label className="filter-field">Campus<select value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">All authorized campuses</option>{campuses.data.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}
          <label className="filter-field">Expiry window<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>Next 7 days</option><option value={30}>Next 30 days</option><option value={90}>Next 90 days</option><option value={365}>Next year</option></select></label>
        </div>
        {loading ? <LoadingState /> : !error && items.length === 0 ? <EmptyState title="No batches need attention">No on-hand lots are expired or expiring within this window.</EmptyState> : !error && (
          <>
            <TableFrame><thead><tr><th>Ingredient</th><th>Batch</th><th>Campus / store</th><th>Remaining</th><th>Expiry</th><th>Status</th></tr></thead><tbody>
              {items.map((batch) => <tr key={batch.id}><td><strong>{batch.ingredient.name}</strong><small>{batch.ingredient.unit}</small></td><td>{batch.batchCode}</td><td>{batch.store.campus.name} · {batch.store.name}</td><td>{batch.remainingQuantity} {batch.ingredient.unit}</td><td>{batch.expiryDate.slice(0, 10)}</td><td><StatusBadge tone={batch.daysUntilExpiry < 0 ? "warning" : batch.daysUntilExpiry <= 7 ? "warning" : "neutral"}>{batch.daysUntilExpiry < 0 ? `${Math.abs(batch.daysUntilExpiry)} days expired` : batch.daysUntilExpiry === 0 ? "Expires today" : `${batch.daysUntilExpiry} days left`}</StatusBadge></td></tr>)}
            </tbody></TableFrame>
            {cursor && <button className="button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more batches"}</button>}
          </>
        )}
      </Panel>
      <p className="capability-note">Opening balances migrated from earlier releases have no known expiry date and are intentionally excluded from this report.</p>
    </>
  );
}

export function IngredientsPage({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState(false);
  const endpoint = `/api/v1/ingredients${query ? `?search=${encodeURIComponent(query)}` : ""}`;
  const { data, error, loading } = useResource<{ ingredients: Ingredient[]; nextCursor: string | null }>(endpoint, refreshKey);

  useEffect(() => {
    setItems(data?.ingredients ?? []);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  async function createIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setFormError(false);
    try {
      await requestJson("/api/v1/ingredients", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      setMessage("Ingredient added to the institution catalog.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setFormError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not add ingredient.");
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await requestJson<{ ingredients: Ingredient[]; nextCursor: string | null }>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`);
      setItems((current) => [...current, ...result.ingredients]);
      setCursor(result.nextCursor);
    } catch (reason) {
      setFormError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not load more ingredients.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Inventory & stock" title="Ingredients" description="Maintain the institution-wide catalog used by stores and inventory movements." action={<Link className="button-secondary" href="/inventory">Stock overview</Link>} />
      {canManage && <Panel title="Add ingredient" description="The unit is the base unit used for all stock quantities.">
        <form className="record-form" onSubmit={(event) => void createIngredient(event)}>
          <label>Ingredient name<input name="name" required maxLength={191} placeholder="e.g. Long-grain rice" /></label>
          <label>Base unit<input name="unit" required maxLength={32} placeholder="kg, L, each" /></label>
          <label>Reorder level<input name="reorderLevel" type="number" min="0" step="0.001" defaultValue="0" /></label>
          <button className="button-primary" type="submit">Add ingredient</button>
        </form>
        <FormNotice message={message} error={formError} />
      </Panel>}
      <Panel title="Ingredient catalog" description="Search the live institution catalog. Catalog updates are currently add-only.">
        <form className="search-bar" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
          <label className="sr-only" htmlFor="ingredient-search">Search ingredients</label>
          <input id="ingredient-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by ingredient name" />
          <button className="button-secondary" type="submit">Search</button>
          {query && <button className="button-quiet" type="button" onClick={() => { setSearch(""); setQuery(""); }}>Clear</button>}
        </form>
        {error && <Notice error>{error}</Notice>}
        {loading ? <LoadingState /> : !error && items.length === 0 ? <EmptyState title={query ? "No matching ingredients" : "No ingredients yet"}>{canManage ? "Add an ingredient above to make it available for stock tracking." : "Ask an institution administrator to add ingredients to the catalog."}</EmptyState> : !error && (
          <>
            <TableFrame><thead><tr><th>Ingredient</th><th>Base unit</th><th>Reorder level</th><th>Scope</th></tr></thead><tbody>
              {items.map((ingredient) => <tr key={ingredient.id}><td><strong>{ingredient.name}</strong></td><td>{ingredient.unit}</td><td>{ingredient.reorderLevel} {ingredient.unit}</td><td><StatusBadge>Institution</StatusBadge></td></tr>)}
            </tbody></TableFrame>
            {cursor && <button className="button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more ingredients"}</button>}
          </>
        )}
      </Panel>
    </>
  );
}

export function MovementsPage({ role }: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [items, setItems] = useState<Movement[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(false);
  const [campusId, setCampusId] = useState("");
  const [kind, setKind] = useState(role === "KITCHEN_STAFF" ? "ISSUE" : "RECEIPT");
  const endpoint = `/api/v1/inventory/movements${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`;
  const { data, error, loading } = useResource<{ movements: Movement[]; nextCursor: string | null }>(endpoint, refreshKey);
  const storesResource = useResource<{ stores: Store[] }>("/api/v1/stores", 0);
  const ingredientsResource = useResource<{ ingredients: Ingredient[]; nextCursor: string | null }>("/api/v1/ingredients", 0);
  const campusesResource = useResource<{ campuses: Campus[] }>("/api/v1/campuses", 0);
  const stores = storesResource.data?.stores ?? [];
  const ingredients = ingredientsResource.data?.ingredients ?? [];

  useEffect(() => {
    setItems(data?.movements ?? []);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  async function recordMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setActionMessage("");
    setActionError(false);
    try {
      await requestJson("/api/v1/inventory/movements", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      setKind(role === "KITCHEN_STAFF" ? "ISSUE" : "RECEIPT");
      setActionMessage("Stock movement recorded and balance updated.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setActionError(true);
      setActionMessage(reason instanceof Error ? reason.message : "Could not record stock movement.");
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await requestJson<{ movements: Movement[]; nextCursor: string | null }>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`);
      setItems((current) => [...current, ...result.movements]);
      setCursor(result.nextCursor);
    } catch (reason) {
      setActionError(true);
      setActionMessage(reason instanceof Error ? reason.message : "Could not load more movements.");
    } finally {
      setLoadingMore(false);
    }
  }

  const kindOptions = role === "KITCHEN_STAFF" ? [["ISSUE", "Issue"]] : [
    ["RECEIPT", "Receipt"],
    ["ISSUE", "Issue"],
    ["WASTE", "Waste"],
    ["ADJUSTMENT", "Adjustment (signed quantity)"],
  ];

  return (
    <>
      <PageHeader eyebrow="Inventory & stock" title="Stock movements" description="Record and review the auditable ledger of receipts, issues, waste, and adjustments." action={<Link className="button-secondary" href="/inventory">Inventory overview</Link>} />
      <Panel title="Record stock movement" description="Each transaction updates the store balance and creates an immutable movement and audit record.">
        {storesResource.error && <Notice error>{storesResource.error}</Notice>}
        {ingredientsResource.error && <Notice error>{ingredientsResource.error}</Notice>}
        {storesResource.loading || ingredientsResource.loading ? <LoadingState label="Loading stores and ingredients…" /> : stores.length === 0 || ingredients.length === 0 ? (
          <EmptyState title="Setup required">Add at least one store and one ingredient before recording a movement. <Link className="text-link" href="/inventory/stores">Manage stores</Link> · <Link className="text-link" href="/inventory/ingredients">Manage ingredients</Link></EmptyState>
        ) : (
          <form className="record-form" onSubmit={(event) => void recordMovement(event)}>
            <label>Store<select name="storeId" required defaultValue=""><option value="" disabled>Select a store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.campus.name} · {store.name}</option>)}</select></label>
            <label>Ingredient<select name="ingredientId" required defaultValue=""><option value="" disabled>Select an ingredient</option>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label>
            <label>Movement type<select name="kind" required value={kind} onChange={(event) => setKind(event.target.value)}>{kindOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Quantity<input name="quantity" type="number" step="0.001" required placeholder={role === "KITCHEN_STAFF" ? "Quantity to issue" : "Positive quantity"} /></label>
            {kind === "RECEIPT" && <label>Batch code (optional)<input name="batchCode" maxLength={100} placeholder="Supplier lot or delivery reference" /></label>}
            {kind === "RECEIPT" && <label>Expiry date (optional)<input name="expiryDate" type="date" /></label>}
            <label className="record-form-wide">Note (optional)<input name="note" maxLength={500} placeholder="Reason or reference" /></label>
            <button className="button-primary" type="submit">Record movement</button>
          </form>
        )}
        <FormNotice message={actionMessage} error={actionError} />
      </Panel>
      <Panel title="Movement history" description="Newest transactions first. Use campus filtering to review authorized locations.">
        {campusesResource.data?.campuses && campusesResource.data.campuses.length > 1 && <label className="filter-field">Campus<select value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">All authorized campuses</option>{campusesResource.data.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}
        {error ? <Notice error>{error}</Notice> : loading ? <LoadingState /> : items.length === 0 ? <EmptyState title="No stock movements yet">The first receipt, issue, waste record, or adjustment will appear here.</EmptyState> : (
          <>
            <TableFrame><thead><tr><th>Date</th><th>Type</th><th>Ingredient</th><th>Campus / store</th><th>Batch</th><th>Quantity</th><th>Note</th></tr></thead><tbody>
              {items.map((item) => <tr key={item.id}><td>{formatDateTime(item.createdAt)}</td><td><StatusBadge tone={item.kind === "RECEIPT" ? "positive" : item.kind === "WASTE" ? "warning" : "neutral"}>{item.kind.toLowerCase()}</StatusBadge></td><td><strong>{item.ingredient.name}</strong><small>{item.ingredient.unit}</small></td><td>{item.store.campus.name} · {item.store.name}</td><td>{item.batch ? <>{item.batch.batchCode}{item.batch.expiryDate ? <small>Expires {item.batch.expiryDate.slice(0, 10)}</small> : null}</> : "Untracked legacy stock"}</td><td>{item.quantity} {item.ingredient.unit}</td><td>{item.note || "—"}</td></tr>)}
            </tbody></TableFrame>
            {cursor && <button className="button-secondary load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load older movements"}</button>}
          </>
        )}
      </Panel>
    </>
  );
}

export function StoresPage({ role }: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const stores = useResource<{ stores: Store[] }>("/api/v1/stores", refreshKey);
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses", 0);

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    try {
      await requestJson("/api/v1/stores", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      setMessage("Store created.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not create store.");
    }
  }

  const canCreate = role === "INSTITUTION_ADMIN" || role === "CAMPUS_MANAGER";
  return (
    <>
      <PageHeader eyebrow="Inventory & stock" title="Stores" description="View stores in your access scope and create locations where stock is managed." />
      {canCreate && <Panel title="Add store" description="Campus managers can add stores to their assigned campus; institution administrators can choose a campus.">
        {campuses.error ? <Notice error>{campuses.error}</Notice> : campuses.loading ? <LoadingState label="Loading campus options…" /> : campuses.data?.campuses.length === 0 ? <EmptyState title="No campus available">Create a campus before adding a store.</EmptyState> : (
          <form className="record-form" onSubmit={(event) => void createStore(event)}>
            <label>Store name<input name="name" required maxLength={191} placeholder="e.g. Main kitchen store" /></label>
            {role === "INSTITUTION_ADMIN" && <label>Campus<select name="campusId" required defaultValue=""><option value="" disabled>Select a campus</option>{campuses.data?.campuses.map((campus) => <option value={campus.id} key={campus.id}>{campus.name}</option>)}</select></label>}
            {role === "INSTITUTION_ADMIN" && <label>Store type<select name="type"><option value="CAMPUS">Campus</option><option value="CENTRAL">Central</option></select></label>}
            <button className="button-primary" type="submit">Add store</button>
          </form>
        )}
        <FormNotice message={message} error={isError} />
      </Panel>}
      <Panel title="Authorized stores" description="Store records are limited by your institution and campus access.">
        {stores.error ? <Notice error>{stores.error}</Notice> : stores.loading ? <LoadingState /> : !stores.data?.stores.length ? <EmptyState title="No stores in this scope">Create a store or ask an administrator to set one up.</EmptyState> : (
          <TableFrame><thead><tr><th>Store</th><th>Campus</th><th>Type</th><th>Stock</th></tr></thead><tbody>
            {stores.data.stores.map((store) => <tr key={store.id}><td><strong>{store.name}</strong></td><td>{store.campus.name}</td><td><StatusBadge>{store.type.toLowerCase()}</StatusBadge></td><td><Link className="text-link" href="/inventory">View inventory →</Link></td></tr>)}
          </tbody></TableFrame>
        )}
        <p className="capability-note">Store rename, archive, and transfer operations are not supported by the current API.</p>
      </Panel>
    </>
  );
}

export function CampusesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses", refreshKey);

  async function createCampus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    try {
      await requestJson("/api/v1/campuses", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      setMessage("Campus created.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not create campus.");
    }
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title="Campuses" description="Manage the locations under this institution. Campus records are protected by institution scope." action={<Link className="button-secondary" href="/administration/team">Team access →</Link>} />
      <Panel title="Add campus" description="Use a stable campus code; it must be unique within your institution.">
        <form className="record-form" onSubmit={(event) => void createCampus(event)}>
          <label>Campus name<input name="name" required maxLength={191} placeholder="e.g. North Campus" /></label>
          <label>Campus code<input name="code" required maxLength={64} placeholder="e.g. NORTH" /></label>
          <button className="button-primary" type="submit">Add campus</button>
        </form>
        <FormNotice message={message} error={isError} />
      </Panel>
      <Panel title="Institution campuses" description="Campus changes are not currently editable or archivable.">
        {campuses.error ? <Notice error>{campuses.error}</Notice> : campuses.loading ? <LoadingState /> : !campuses.data?.campuses.length ? <EmptyState title="No campuses available">Add the first campus to organize stores and team assignments.</EmptyState> : (
          <TableFrame><thead><tr><th>Campus</th><th>Code</th><th>Team access</th><th>Stores</th></tr></thead><tbody>
            {campuses.data.campuses.map((campus) => <tr key={campus.id}><td><strong>{campus.name}</strong></td><td><StatusBadge>{campus.code}</StatusBadge></td><td><Link className="text-link" href="/administration/team">Manage team →</Link></td><td><Link className="text-link" href="/inventory/stores">View stores →</Link></td></tr>)}
          </tbody></TableFrame>
        )}
      </Panel>
    </>
  );
}

export function TeamPage({ actorEmail }: { actorEmail: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const memberships = useResource<{ memberships: Membership[] }>("/api/v1/memberships", refreshKey);
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses", 0);

  async function submitMembership(event: FormEvent<HTMLFormElement>, membershipId?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const result = await requestJson<{ temporaryPassword?: string | null }>(
        "/api/v1/memberships",
        { method: membershipId ? "PATCH" : "POST", body: JSON.stringify(membershipId ? { ...payload, membershipId } : payload) },
      );
      form.reset();
      setEditing(null);
      setMessage(result.temporaryPassword
        ? `Account created. Deliver this temporary password through a separate secure channel; it is shown once: ${result.temporaryPassword}`
        : membershipId ? "Membership access updated." : "Membership added to the existing account.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not save membership.");
    }
  }

  async function revokeMembership(membershipId: string) {
    if (!window.confirm("Revoke this institution membership? The user will lose access to this institution.")) return;
    setMessage("");
    setIsError(false);
    try {
      await requestJson("/api/v1/memberships", { method: "DELETE", body: JSON.stringify({ membershipId }) });
      setMessage("Membership revoked.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not revoke membership.");
    }
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title="Team access" description="Assign institution roles and campus scope. New accounts receive a temporary password that must be changed at first sign-in." action={<Link className="button-secondary" href="/administration/campuses">Manage campuses →</Link>} />
      <Panel title="Add team member" description="Use an existing account email to add this institution membership, or create a new account.">
        {campuses.error ? <Notice error>{campuses.error}</Notice> : campuses.loading ? <LoadingState label="Loading campuses…" /> : (
          <form className="record-form" onSubmit={(event) => void submitMembership(event)}>
            <label>Name<input name="name" required maxLength={191} /></label>
            <label>Email<input name="email" type="email" required maxLength={191} /></label>
            <label>Role<select name="role" defaultValue="CAMPUS_MANAGER"><option value="CAMPUS_MANAGER">Campus manager</option><option value="KITCHEN_STAFF">Kitchen staff</option><option value="STOREKEEPER">Storekeeper</option><option value="INSTITUTION_ADMIN">Institution administrator</option></select></label>
            <label>Campus (required for campus roles)<select name="campusId" defaultValue=""><option value="">Select a campus</option>{campuses.data?.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
            <button className="button-primary" type="submit">Add membership</button>
          </form>
        )}
        <FormNotice message={message} error={isError} />
      </Panel>
      <Panel title="Institution memberships" description="Role and campus assignments are enforced by the server on each API request.">
        {memberships.error ? <Notice error>{memberships.error}</Notice> : memberships.loading ? <LoadingState /> : !memberships.data?.memberships.length ? <EmptyState title="No memberships found" /> : (
          <div className="membership-list">{memberships.data.memberships.map((membership) => (
            <article className="membership-card" key={membership.id}>
              <div className="membership-identity"><span className="profile-avatar">{membership.user.name.slice(0, 1).toUpperCase()}</span><span><strong>{membership.user.name}</strong><small>{membership.user.email}</small><small>{membership.campus?.name ?? "All campuses"}</small></span></div>
              <div className="membership-meta"><StatusBadge>{membership.role.toLowerCase().replaceAll("_", " ")}</StatusBadge>{membership.user.mustChangePassword && <StatusBadge tone="warning">Password change required</StatusBadge>}</div>
              {membership.user.email !== actorEmail && <div className="membership-actions">
                <button className="button-secondary" onClick={() => setEditing(editing === membership.id ? null : membership.id)}>{editing === membership.id ? "Cancel" : "Edit access"}</button>
                <button className="button-danger-quiet" onClick={() => void revokeMembership(membership.id)}>Revoke</button>
              </div>}
              {editing === membership.id && <form className="membership-editor" onSubmit={(event) => void submitMembership(event, membership.id)}>
                <label>Role<select name="role" defaultValue={membership.role}><option value="CAMPUS_MANAGER">Campus manager</option><option value="KITCHEN_STAFF">Kitchen staff</option><option value="STOREKEEPER">Storekeeper</option><option value="INSTITUTION_ADMIN">Institution administrator</option></select></label>
                <label>Campus<select name="campusId" defaultValue={membership.campus?.id ?? ""}>{campuses.data?.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
                <button className="button-primary" type="submit">Save access</button>
              </form>}
            </article>
          ))}</div>
        )}
      </Panel>
    </>
  );
}
