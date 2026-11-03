"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  TableFrame,
} from "@/components/workspace-primitives";

type Campus = { id: string; name: string };
type Store = { id: string; name: string; type: string; campus: Campus };
type Ingredient = { id: string; name: string; unit: string };
type Resource<T> = { data: T | null; error: string; loading: boolean };
type IssueDraft = { ingredientId: string; quantity: string };

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

function useResource<T>(url: string, revision = 0): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!url) {
      setData(null);
      setError("");
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    requestJson<T>(url).then((value) => {
      if (active) setData(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load records.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [url, revision]);
  return { data, error, loading };
}

function Feedback({ text, error }: { text: string; error: boolean }) {
  return text ? <Notice error={error}>{text}</Notice> : null;
}

function useSubmission() {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  return { message, setMessage, isError, setIsError, busy, setBusy };
}

type ProductionRun = {
  id: string;
  name: string;
  preparedServings: number;
  servedServings: number;
  leftoverServings: number;
  totalCost: string | null;
  createdAt: string;
  campus: Campus;
  store: { id: string; name: string };
  menuPlan: { id: string; name: string } | null;
  issues: Array<{ id: string; quantity: string; unitCost: string | null; ingredient: Ingredient }>;
  wasteRecords?: Array<{ id: string; category: string; quantity: string; unit: string; estimatedCost: string | null; reason: string }>;
};

type MenuPlan = { id: string; name: string; status: string; campus: Campus };

export function ProductionPage({
  role,
  assignedCampusId,
}: {
  role: string;
  assignedCampusId: string | null;
}) {
  const [revision, setRevision] = useState(0);
  const [campusId, setCampusId] = useState(assignedCampusId ?? "");
  const [issues, setIssues] = useState<IssueDraft[]>([{ ingredientId: "", quantity: "" }]);
  const submission = useSubmission();
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses");
  const ingredients = useResource<{ ingredients: Ingredient[] }>("/api/v1/ingredients");
  const stores = useResource<{ stores: Store[] }>(campusId ? `/api/v1/stores?campusId=${encodeURIComponent(campusId)}` : "/api/v1/stores");
  const menus = useResource<{ menuPlans: MenuPlan[] }>(campusId ? `/api/v1/menu-plans?campusId=${encodeURIComponent(campusId)}` : "/api/v1/menu-plans");
  const runs = useResource<{ runs: ProductionRun[] }>(`/api/v1/production-runs${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`, revision);
  const canRecord = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"].includes(role);
  const activeStores = stores.data?.stores ?? [];
  const activeMenus = menus.data?.menuPlans.filter((menu) => menu.status === "PUBLISHED") ?? [];

  useEffect(() => {
    if (assignedCampusId && campusId !== assignedCampusId) setCampusId(assignedCampusId);
  }, [assignedCampusId, campusId]);
  useEffect(() => {
    if (!campusId && campuses.data?.campuses.length === 1) setCampusId(campuses.data.campuses[0].id);
  }, [campusId, campuses.data]);

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/production-runs", {
        method: "POST",
        body: JSON.stringify({
          campusId,
          storeId: values.get("storeId"),
          menuPlanId: values.get("menuPlanId") || undefined,
          name: values.get("name"),
          preparedServings: values.get("preparedServings"),
          servedServings: values.get("servedServings"),
          leftoverServings: values.get("leftoverServings"),
          note: values.get("note"),
          items: issues,
        }),
      });
      form.reset();
      setIssues([{ ingredientId: "", quantity: "" }]);
      submission.setMessage("Production recorded and actual ingredient issues deducted from inventory.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not record production.");
    } finally {
      submission.setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Kitchen operations" title="Production records" description="Record prepared and served portions against actual stock issues; the ledger and batches update in the same transaction." action={<Link className="button-secondary" href="/operations/waste">Record waste →</Link>} />
      <Feedback text={submission.message} error={submission.isError} />
      {canRecord && <Panel title="Record a production run" description="Use a published meal plan when available; actual ingredient quantities are required for cost and stock accountability.">
        {stores.error ? <Notice error>{stores.error}</Notice> : ingredients.error ? <Notice error>{ingredients.error}</Notice> : menus.error ? <Notice error>{menus.error}</Notice> : null}
        {stores.loading || ingredients.loading || menus.loading ? <LoadingState /> : !activeStores.length || !ingredients.data?.ingredients.length ? <EmptyState title="Production setup required">Add a campus store and active ingredients before recording production.</EmptyState> : (
          <form className="record-form" onSubmit={(event) => void createRun(event)}>
            {!assignedCampusId && <label>Campus<select required value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">Select campus</option>{campuses.data?.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}
            <label>Store<select name="storeId" required defaultValue=""><option value="" disabled>Select store</option>{activeStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
            <label>Published meal plan<select name="menuPlanId" defaultValue=""><option value="">No linked plan</option>{activeMenus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}</select></label>
            <label>Production name<input name="name" maxLength={191} placeholder="Optional if linked to a menu" /></label>
            <label>Prepared servings<input name="preparedServings" type="number" min="1" max="1000000" step="1" required /></label>
            <label>Served servings<input name="servedServings" type="number" min="0" max="1000000" step="1" required /></label>
            <label>Leftover servings<input name="leftoverServings" type="number" min="0" max="1000000" step="1" required defaultValue="0" /></label>
            <div className="record-form-wide">
              <strong>Actual ingredients issued</strong>
              <div className="ingredient-lines">
                {issues.map((line, index) => <div className="ingredient-line" key={index}>
                  <label>Ingredient<select required value={line.ingredientId} onChange={(event) => setIssues((rows) => rows.map((row, i) => i === index ? { ...row, ingredientId: event.target.value } : row))}><option value="">Select ingredient</option>{ingredients.data?.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label>
                  <label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setIssues((rows) => rows.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} /></label>
                  {issues.length > 1 && <button className="button-quiet" type="button" onClick={() => setIssues((rows) => rows.filter((_, i) => i !== index))}>Remove</button>}
                </div>)}
                <button className="button-secondary" type="button" onClick={() => setIssues((rows) => [...rows, { ingredientId: "", quantity: "" }])}>Add ingredient</button>
              </div>
            </div>
            <label className="record-form-wide">Note<input name="note" maxLength={500} placeholder="Shift, kitchen or service context" /></label>
            <div className="form-actions"><button className="button-primary" disabled={submission.busy}>{submission.busy ? "Recording…" : "Record production"}</button></div>
          </form>
        )}
      </Panel>}
      <Panel title="Production history" description="Prepared and served counts, stock issues, and known ingredient costs.">
        {runs.error ? <Notice error>{runs.error}</Notice> : runs.loading ? <LoadingState /> : !runs.data?.runs.length ? <EmptyState title="No production records">Completed runs will appear here after they are recorded.</EmptyState> : (
          <div className="purchase-request-list">{runs.data.runs.map((run) => <article className="purchase-request-card" key={run.id}>
            <div className="purchase-request-heading"><div><h3>{run.name}</h3><p>{run.campus.name} · {run.store.name} · {new Date(run.createdAt).toLocaleString()}</p></div><StatusBadge tone="positive">recorded</StatusBadge></div>
            <p className="purchase-request-note">Prepared {run.preparedServings} · served {run.servedServings} · leftovers {run.leftoverServings} · ingredient cost {run.totalCost === null ? "unknown" : run.totalCost}</p>
            {run.menuPlan && <p className="purchase-request-note">Meal plan: {run.menuPlan.name}</p>}
            <ul className="purchase-request-items">{run.issues.map((issue) => <li key={issue.id}><span>{issue.ingredient.name}</span><strong>{issue.quantity} {issue.ingredient.unit}</strong></li>)}</ul>
          </article>)}</div>
        )}
      </Panel>
    </>
  );
}

export function WastePage({
  role,
  assignedCampusId,
}: {
  role: string;
  assignedCampusId: string | null;
}) {
  const [revision, setRevision] = useState(0);
  const [campusId, setCampusId] = useState(assignedCampusId ?? "");
  const [category, setCategory] = useState("RAW_INGREDIENT");
  const submission = useSubmission();
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses");
  const stores = useResource<{ stores: Store[] }>(campusId ? `/api/v1/stores?campusId=${encodeURIComponent(campusId)}` : "/api/v1/stores");
  const ingredients = useResource<{ ingredients: Ingredient[] }>("/api/v1/ingredients");
  const runs = useResource<{ runs: ProductionRun[] }>(role === "STOREKEEPER" ? "" : `/api/v1/production-runs${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`);
  const records = useResource<{ records: Array<{
    id: string; category: string; quantity: string; unit: string; estimatedCost: string | null;
    reason: string; createdAt: string; campus: Campus; store: { name: string } | null;
    ingredient: { name: string } | null; productionRun: { name: string } | null;
  }> }>(`/api/v1/waste${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`, revision);
  const canRecord = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF", "STOREKEEPER"].includes(role);
  const rawWaste = category === "RAW_INGREDIENT" || category === "SPOILAGE";

  useEffect(() => {
    if (assignedCampusId && campusId !== assignedCampusId) setCampusId(assignedCampusId);
  }, [assignedCampusId, campusId]);
  useEffect(() => {
    if (!campusId && campuses.data?.campuses.length === 1) setCampusId(campuses.data.campuses[0].id);
  }, [campusId, campuses.data]);

  async function createWaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/waste", {
        method: "POST",
        body: JSON.stringify({
          campusId,
          category,
          quantity: values.get("quantity"),
          reason: values.get("reason"),
          ...(rawWaste
            ? { storeId: values.get("storeId"), ingredientId: values.get("ingredientId") }
            : { productionRunId: values.get("productionRunId") }),
        }),
      });
      form.reset();
      submission.setMessage(rawWaste ? "Waste recorded and stock was deducted transactionally." : "Prepared-food waste recorded with the run's known cost basis.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not record waste.");
    } finally {
      submission.setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Kitchen accountability" title="Leftovers & waste" description="Record raw-ingredient loss against stock or prepared-meal loss against a production run." action={<Link className="button-secondary" href="/operations/production">Production records →</Link>} />
      <Feedback text={submission.message} error={submission.isError} />
      {canRecord && <Panel title="Record waste" description="Raw ingredient waste changes batch quantities and the stock ledger. Prepared food is costed from the recorded production run when cost data exists.">
        {!assignedCampusId && <label className="form-filter">Campus<select value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">Select campus</option>{campuses.data?.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>}
        <form className="record-form" onSubmit={(event) => void createWaste(event)}>
          <label>Waste category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="RAW_INGREDIENT">Raw ingredient</option><option value="SPOILAGE">Spoilage</option>{role !== "STOREKEEPER" && <><option value="PREPARED_MEAL">Prepared meal</option><option value="LEFTOVER">Leftover</option></>}</select></label>
          {rawWaste ? <>
            <label>Store<select name="storeId" required defaultValue=""><option value="">Select store</option>{stores.data?.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
            <label>Ingredient<select name="ingredientId" required defaultValue=""><option value="">Select ingredient</option>{ingredients.data?.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label>
          </> : <label>Production run<select name="productionRunId" required defaultValue=""><option value="">Select production run</option>{runs.data?.runs.map((run) => <option key={run.id} value={run.id}>{run.name} · {run.createdAt.slice(0, 10)}</option>)}</select></label>}
          <label>Quantity<input name="quantity" required type="number" min="0.001" step="0.001" /></label>
          <label className="record-form-wide">Reason<input name="reason" required maxLength={500} placeholder="Record the operational reason" /></label>
          <div className="form-actions"><button className="button-primary" disabled={submission.busy}>{submission.busy ? "Saving…" : "Record waste"}</button></div>
        </form>
      </Panel>}
      <Panel title="Waste history">
        {records.error ? <Notice error>{records.error}</Notice> : records.loading ? <LoadingState /> : !records.data?.records.length ? <EmptyState title="No waste records">Recorded stock and prepared-food waste will appear here.</EmptyState> : (
          <TableFrame><thead><tr><th>When</th><th>Category</th><th>Campus / source</th><th>Quantity</th><th>Known cost</th><th>Reason</th></tr></thead><tbody>
            {records.data.records.map((record) => <tr key={record.id}><td>{new Date(record.createdAt).toLocaleDateString()}</td><td><StatusBadge tone="warning">{record.category.toLowerCase().replaceAll("_", " ")}</StatusBadge></td><td>{record.campus.name} · {record.ingredient?.name ?? record.productionRun?.name ?? record.store?.name ?? "—"}</td><td>{record.quantity} {record.unit}</td><td>{record.estimatedCost ?? "Unknown"}</td><td>{record.reason}</td></tr>)}
          </tbody></TableFrame>
        )}
      </Panel>
    </>
  );
}

export function TransfersPage({ role }: { role: string }) {
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<IssueDraft[]>([{ ingredientId: "", quantity: "" }]);
  const submission = useSubmission();
  const stores = useResource<{ stores: Store[] }>("/api/v1/stores");
  const ingredients = useResource<{ ingredients: Ingredient[] }>("/api/v1/ingredients");
  const transfers = useResource<{ transfers: Array<{
    id: string; note: string | null; createdAt: string; originCampus: Campus; destinationCampus: Campus;
    originStore: { name: string }; destinationStore: { name: string };
    items: Array<{ id: string; quantity: string; ingredient: Ingredient }>;
  }> }>("/api/v1/stock-transfers", revision);
  const canTransfer = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"].includes(role);

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (values.get("originStoreId") === values.get("destinationStoreId")) {
      submission.setIsError(true);
      submission.setMessage("Choose different origin and destination stores.");
      return;
    }
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/stock-transfers", {
        method: "POST",
        body: JSON.stringify({
          originStoreId: values.get("originStoreId"),
          destinationStoreId: values.get("destinationStoreId"),
          note: values.get("note"),
          items,
        }),
      });
      form.reset();
      setItems([{ ingredientId: "", quantity: "" }]);
      submission.setMessage("Transfer completed; both stores, batch records, and ledger entries were updated atomically.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not complete the transfer.");
    } finally {
      submission.setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Inventory & stock" title="Campus allocations & transfers" description="Move actual lots from a central or campus store; paired transfer movements preserve total institutional stock and batch cost/expiry." />
      <Feedback text={submission.message} error={submission.isError} />
      {canTransfer && <Panel title="Complete a stock transfer" description="A transfer is completed atomically; insufficient source stock or any failed line cancels the entire operation.">
        {stores.error ? <Notice error>{stores.error}</Notice> : ingredients.error ? <Notice error>{ingredients.error}</Notice> : null}
        {stores.loading || ingredients.loading ? <LoadingState /> : (stores.data?.stores.length ?? 0) < 2 ? <EmptyState title="Two stores are required">Create a destination store before allocating stock.</EmptyState> : (
          <form className="record-form" onSubmit={(event) => void createTransfer(event)}>
            <label>Origin store<select name="originStoreId" required defaultValue=""><option value="">Select origin</option>{stores.data?.stores.map((store) => <option key={store.id} value={store.id}>{store.campus.name} · {store.name} ({store.type.toLowerCase()})</option>)}</select></label>
            <label>Destination store<select name="destinationStoreId" required defaultValue=""><option value="">Select destination</option>{stores.data?.stores.map((store) => <option key={store.id} value={store.id}>{store.campus.name} · {store.name} ({store.type.toLowerCase()})</option>)}</select></label>
            <div className="record-form-wide"><strong>Allocated ingredients</strong><div className="ingredient-lines">
              {items.map((item, index) => <div className="ingredient-line" key={index}>
                <label>Ingredient<select required value={item.ingredientId} onChange={(event) => setItems((rows) => rows.map((row, i) => i === index ? { ...row, ingredientId: event.target.value } : row))}><option value="">Select ingredient</option>{ingredients.data?.ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label>
                <label>Quantity<input required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => setItems((rows) => rows.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} /></label>
                {items.length > 1 && <button className="button-quiet" type="button" onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}>Remove</button>}
              </div>)}
              <button className="button-secondary" type="button" onClick={() => setItems((rows) => [...rows, { ingredientId: "", quantity: "" }])}>Add ingredient</button>
            </div></div>
            <label className="record-form-wide">Note<input name="note" maxLength={500} placeholder="Allocation reference" /></label>
            <div className="form-actions"><button className="button-primary" disabled={submission.busy}>{submission.busy ? "Transferring…" : "Complete transfer"}</button></div>
          </form>
        )}
      </Panel>}
      <Panel title="Transfer history">
        {transfers.error ? <Notice error>{transfers.error}</Notice> : transfers.loading ? <LoadingState /> : !transfers.data?.transfers.length ? <EmptyState title="No stock transfers">Completed campus allocations will appear here.</EmptyState> : (
          <div className="purchase-request-list">{transfers.data.transfers.map((transfer) => <article className="purchase-request-card" key={transfer.id}>
            <div className="purchase-request-heading"><div><h3>{transfer.originCampus.name} → {transfer.destinationCampus.name}</h3><p>{transfer.originStore.name} → {transfer.destinationStore.name} · {new Date(transfer.createdAt).toLocaleString()}</p></div><StatusBadge tone="positive">completed</StatusBadge></div>
            {transfer.note && <p className="purchase-request-note">{transfer.note}</p>}
            <ul className="purchase-request-items">{transfer.items.map((item) => <li key={item.id}><span>{item.ingredient.name}</span><strong>{item.quantity} {item.ingredient.unit}</strong></li>)}</ul>
          </article>)}</div>
        )}
      </Panel>
    </>
  );
}

type PurchaseOrderOption = { id: string; status: string; supplier: { name: string }; campus: Campus };

export function FinancePage({ role, assignedCampusId }: { role: string; assignedCampusId: string | null }) {
  const [revision, setRevision] = useState(0);
  const submission = useSubmission();
  const orders = useResource<{ orders: PurchaseOrderOption[] }>("/api/v1/purchase-orders");
  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses");
  const invoices = useResource<{ invoices: Array<{
    id: string; supplierInvoiceNumber: string; invoiceDate: string; amount: string; status: string;
    purchaseOrder: { id: string; campus: Campus; supplier: { name: string }; items: Array<{ receivedQuantity: string; unitCost: string | null }> };
  }> }>("/api/v1/supplier-invoices", revision);
  const budgets = useResource<{ budgets: Array<{
    id: string; name: string; campus: Campus | null; periodStart: string; periodEnd: string;
    amount: string; spent: string; remaining: string; utilizationPercent: number;
  }> }>("/api/v1/budgets", revision);
  const canManage = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "FINANCE_OFFICER"].includes(role);

  async function createBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/budgets", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      submission.setMessage("Budget created. Spend is calculated from reconciled supplier invoices.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not create budget.");
    } finally {
      submission.setBusy(false);
    }
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/supplier-invoices", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      submission.setMessage("Invoice recorded as pending reconciliation.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not record invoice.");
    } finally {
      submission.setBusy(false);
    }
  }

  async function setInvoiceStatus(id: string, action: "reconcile" | "reject") {
    if (!window.confirm(action === "reconcile" ? "Reconcile this invoice against the received order quantities and agreed prices?" : "Reject this invoice?")) return;
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/supplier-invoices", { method: "PATCH", body: JSON.stringify({ id, action }) });
      submission.setMessage(action === "reconcile" ? "Invoice reconciled and included in budget spend." : "Invoice rejected.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not update invoice.");
    } finally {
      submission.setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Finance & accountability" title="Budgets & invoice reconciliation" description="Reconcile supplier invoices to accepted quantities and agreed prices; budget actuals use reconciled expenses only." action={<Link className="button-secondary" href="/reports">Operational reports →</Link>} />
      <Feedback text={submission.message} error={submission.isError} />
      {canManage && <>
        <Panel title="Record supplier invoice" description="Invoices require a goods receipt; reconciliation later checks billed value against received quantities and order unit costs.">
          {orders.error && <Notice error>{orders.error}</Notice>}
          <form className="record-form" onSubmit={(event) => void createInvoice(event)}>
            <label>Purchase order<select name="purchaseOrderId" required defaultValue=""><option value="">Select received order</option>{orders.data?.orders.filter((order) => order.status !== "OPEN").map((order) => <option key={order.id} value={order.id}>{order.supplier.name} · {order.campus.name} · {order.id.slice(0, 8)}</option>)}</select></label>
            <label>Invoice number<input name="supplierInvoiceNumber" required maxLength={100} /></label>
            <label>Invoice date<input name="invoiceDate" required type="date" /></label>
            <label>Invoice total<input name="amount" required type="number" min="0" step="0.01" /></label>
            <label className="record-form-wide">Note<input name="note" maxLength={500} /></label>
            <div className="form-actions"><button className="button-primary" disabled={submission.busy}>{submission.busy ? "Saving…" : "Record invoice"}</button></div>
          </form>
        </Panel>
        <Panel title="Create budget" description="Budgets may be campus-specific or institution-wide and use a fixed date range.">
          <form className="record-form" onSubmit={(event) => void createBudget(event)}>
            <label>Budget name<input name="name" required maxLength={191} /></label>
            <label>Campus<select name="campusId" defaultValue={role === "INSTITUTION_ADMIN" ? "" : assignedCampusId ?? ""} disabled={role !== "INSTITUTION_ADMIN"}>{role === "INSTITUTION_ADMIN" && <option value="">Institution-wide</option>}{campuses.data?.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></label>
            <label>Start date<input name="periodStart" required type="date" /></label>
            <label>End date<input name="periodEnd" required type="date" /></label>
            <label>Amount<input name="amount" required type="number" min="0" step="0.01" /></label>
            <div className="form-actions"><button className="button-primary" disabled={submission.busy}>{submission.busy ? "Saving…" : "Create budget"}</button></div>
          </form>
        </Panel>
      </>}
      <Panel title="Budget performance">
        {budgets.error ? <Notice error>{budgets.error}</Notice> : budgets.loading ? <LoadingState /> : !budgets.data?.budgets.length ? <EmptyState title="No budgets set">Create a budget to track reconciled purchase spend.</EmptyState> : <TableFrame><thead><tr><th>Budget</th><th>Campus</th><th>Period</th><th>Budget</th><th>Spent</th><th>Remaining</th><th>Utilization</th></tr></thead><tbody>
          {budgets.data.budgets.map((budget) => <tr key={budget.id}><td><strong>{budget.name}</strong></td><td>{budget.campus?.name ?? "Institution"}</td><td>{budget.periodStart.slice(0, 10)} – {budget.periodEnd.slice(0, 10)}</td><td>{budget.amount}</td><td>{budget.spent}</td><td>{budget.remaining}</td><td><StatusBadge tone={budget.utilizationPercent >= 100 ? "warning" : "neutral"}>{budget.utilizationPercent}%</StatusBadge></td></tr>)}
        </tbody></TableFrame>}
      </Panel>
      <Panel title="Supplier invoices">
        {invoices.error ? <Notice error>{invoices.error}</Notice> : invoices.loading ? <LoadingState /> : !invoices.data?.invoices.length ? <EmptyState title="No invoices">Invoices are linked to received purchase orders.</EmptyState> : <TableFrame><thead><tr><th>Invoice</th><th>Supplier / campus</th><th>Order</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {invoices.data.invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.supplierInvoiceNumber}</td><td>{invoice.purchaseOrder.supplier.name} · {invoice.purchaseOrder.campus.name}</td><td>{invoice.purchaseOrder.id.slice(0, 8)}</td><td>{invoice.invoiceDate.slice(0, 10)}</td><td>{invoice.amount}</td><td><StatusBadge tone={invoice.status === "RECONCILED" ? "positive" : invoice.status === "REJECTED" ? "warning" : "neutral"}>{invoice.status.toLowerCase()}</StatusBadge></td><td>{invoice.status === "PENDING" && canManage && <div className="purchase-actions"><button className="button-primary" type="button" disabled={submission.busy} onClick={() => void setInvoiceStatus(invoice.id, "reconcile")}>Reconcile</button><button className="button-quiet" type="button" disabled={submission.busy} onClick={() => void setInvoiceStatus(invoice.id, "reject")}>Reject</button></div>}</td></tr>)}
        </tbody></TableFrame>}
      </Panel>
    </>
  );
}

export function ReportsPage() {
  const report = useResource<{
    period: { from: string; to: string };
    production: { runs: number; preparedServings: number; servedServings: number; leftoverServings: number; knownIngredientCost: string | null };
    waste: Array<{ category: string; records: number; quantity: string; estimatedCost: string | null }>;
    procurement: { reconciledInvoices: number; reconciledSpend: string };
    inventoryValuation: { knownCost: string; quantityWithoutCost: string };
    campuses: Array<{ id: string; name: string; runs: number; preparedServings: number; servedServings: number; leftoverServings: number; wasteCost: string | null; reconciledPurchaseSpend: string }>;
  }>("/api/v1/reports");
  const forecast = useResource<{ lookbackDays: number; horizonDays: number; method: string; forecast: Array<{
    ingredient: Ingredient; observedConsumption30Days: string; availableNonExpired: string;
    projectedDemand: string | null; recommendedPurchase: string | null; hasConsumptionHistory: boolean;
  }> }>("/api/v1/analytics/forecast");
  const suppliers = useResource<{ suppliers: Array<{
    supplier: { id: string; name: string }; orders: number; reconciledInvoices: number; reconciledSpend: string;
    orderedQuantity: string; receivedQuantity: string; fulfillmentPercent: number | null;
  }> }>("/api/v1/analytics/suppliers");
  return (
    <>
      <PageHeader eyebrow="Reports & analytics" title="Operational insights" description="Actual production, waste, reconciled expenses, inventory valuation, supplier fulfillment, and a transparent short-term demand projection." action={<a className="button-secondary" href="/api/v1/reports?format=csv">Export campus CSV</a>} />
      {report.error && <Notice error>{report.error}</Notice>}
      {report.loading ? <LoadingState /> : report.data && <>
        <div className="metric-grid">
          <article className="metric-card"><span>Production runs</span><strong>{report.data.production.runs}</strong><small>{report.data.period.from} – {report.data.period.to}</small></article>
          <article className="metric-card"><span>Served servings</span><strong>{report.data.production.servedServings}</strong><small>{report.data.production.leftoverServings} leftovers recorded</small></article>
          <article className="metric-card"><span>Reconciled spend</span><strong>{report.data.procurement.reconciledSpend}</strong><small>{report.data.procurement.reconciledInvoices} invoices</small></article>
          <article className="metric-card"><span>Known stock value</span><strong>{report.data.inventoryValuation.knownCost}</strong><small>Excludes batches without unit cost</small></article>
        </div>
        <Panel title="Campus comparison"><TableFrame><thead><tr><th>Campus</th><th>Runs</th><th>Prepared</th><th>Served</th><th>Leftovers</th><th>Waste cost</th><th>Purchase spend</th></tr></thead><tbody>
          {report.data.campuses.map((campus) => <tr key={campus.id}><td><strong>{campus.name}</strong></td><td>{campus.runs}</td><td>{campus.preparedServings}</td><td>{campus.servedServings}</td><td>{campus.leftoverServings}</td><td>{campus.wasteCost ?? "Unknown"}</td><td>{campus.reconciledPurchaseSpend}</td></tr>)}
        </tbody></TableFrame></Panel>
        <Panel title="Waste summary"><TableFrame><thead><tr><th>Category</th><th>Records</th><th>Quantity</th><th>Known cost</th></tr></thead><tbody>
          {report.data.waste.map((row) => <tr key={row.category}><td>{row.category.toLowerCase().replaceAll("_", " ")}</td><td>{row.records}</td><td>{row.quantity}</td><td>{row.estimatedCost ?? "Unknown"}</td></tr>)}
          {!report.data.waste.length && <tr><td colSpan={4}>No waste recorded in this period.</td></tr>}
        </tbody></TableFrame></Panel>
      </>}
      <Panel title="Demand and purchase suggestions" description={forecast.data?.method ?? "Based on recorded stock issues and raw-stock waste, not simulated data."}>
        {forecast.error ? <Notice error>{forecast.error}</Notice> : forecast.loading ? <LoadingState /> : !forecast.data?.forecast.some((item) => item.hasConsumptionHistory) ? <EmptyState title="Consumption history is needed">Record stock issues over time to calculate demand suggestions. No-history ingredients are deliberately not assigned a forecast.</EmptyState> : <TableFrame><thead><tr><th>Ingredient</th><th>Used in last 30 days</th><th>Available, non-expired</th><th>Projected {forecast.data.horizonDays}d</th><th>Suggested purchase</th></tr></thead><tbody>
          {forecast.data.forecast.filter((item) => item.hasConsumptionHistory).map((item) => <tr key={item.ingredient.id}><td><strong>{item.ingredient.name}</strong></td><td>{item.observedConsumption30Days} {item.ingredient.unit}</td><td>{item.availableNonExpired} {item.ingredient.unit}</td><td>{item.projectedDemand} {item.ingredient.unit}</td><td>{item.recommendedPurchase} {item.ingredient.unit}</td></tr>)}
        </tbody></TableFrame>}
      </Panel>
      <Panel title="Supplier performance" description="Fulfillment compares received quantities to ordered quantities; spend includes reconciled invoices only.">
        {suppliers.error ? <Notice error>{suppliers.error}</Notice> : suppliers.loading ? <LoadingState /> : !suppliers.data?.suppliers.length ? <EmptyState title="No supplier orders yet">Supplier performance will appear after orders and receipts are recorded.</EmptyState> : <TableFrame><thead><tr><th>Supplier</th><th>Orders</th><th>Received / ordered</th><th>Fulfillment</th><th>Reconciled spend</th></tr></thead><tbody>
          {suppliers.data.suppliers.map((row) => <tr key={row.supplier.id}><td><strong>{row.supplier.name}</strong></td><td>{row.orders}</td><td>{row.receivedQuantity} / {row.orderedQuantity}</td><td>{row.fulfillmentPercent === null ? "—" : `${row.fulfillmentPercent}%`}</td><td>{row.reconciledSpend}</td></tr>)}
        </tbody></TableFrame>}
      </Panel>
      <Panel title="Integrations" description="The versioned APIs and CSV export provide a stable integration boundary. No third-party system is connected in this deployment.">
        <p>External SSO, accounting, and hostel/student-system adapters require institution-specific provider credentials, scopes, and data-processing approval. Configure those outside the application before enabling a connector; this environment contains no external credentials.</p>
        <p>API routes are versioned under <code>/api/v1</code>; CSV exports are available from the reports page.</p>
      </Panel>
    </>
  );
}

export function AuditLogPage() {
  const [query, setQuery] = useState("");
  const events = useResource<{ events: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    actor: { name: string } | null;
  }> }>("/api/v1/audit-events");
  const filtered = (events.data?.events ?? []).filter((event) =>
    `${event.action} ${event.entityType} ${event.entityId} ${event.actor?.name ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader eyebrow="Administration" title="Audit log" description="Review recent, institution-scoped operational and access events." />
      <Panel title="Recent activity" description="Showing up to 200 latest events. Audit records are immutable.">
        <label className="form-filter">Search audit events<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Action, record, or user" /></label>
        {events.error ? <Notice error>{events.error}</Notice> : events.loading ? <LoadingState /> : !filtered.length ? <EmptyState title={query ? "No matching events" : "No audit events"}>{query ? "Try a different search term." : "Recorded system activity will appear here."}</EmptyState> : (
          <TableFrame><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Actor</th></tr></thead><tbody>
            {filtered.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td><StatusBadge>{event.action}</StatusBadge></td><td>{event.entityType} · <code>{event.entityId}</code></td><td>{event.actor?.name ?? "System"}</td></tr>)}
          </tbody></TableFrame>
        )}
      </Panel>
    </>
  );
}

type QuotedRequest = {
  id: string;
  status: string;
  campus: Campus;
  supplier: { id: string; name: string };
  items: Array<{ id: string; quantity: string; ingredient: Ingredient }>;
  purchaseOrder: { id: string; status: string } | null;
};

type QuoteDraftLine = { ingredientId: string; quantity: string; unitCost: string; ingredient: Ingredient };

export function QuotesPage({ role }: { role: string }) {
  const [revision, setRevision] = useState(0);
  const [requestId, setRequestId] = useState("");
  const [lines, setLines] = useState<QuoteDraftLine[]>([]);
  const submission = useSubmission();
  const requests = useResource<{ requests: QuotedRequest[] }>("/api/v1/purchase-requests");
  const suppliers = useResource<{ suppliers: Array<{ id: string; name: string }> }>("/api/v1/suppliers");
  const quotes = useResource<{ quotes: Array<{
    id: string; status: string; validUntil: string | null; note: string | null;
    supplier: { id: string; name: string }; purchaseRequest: { id: string; status: string; campus: { name: string } };
    items: Array<{ id: string; quantity: string; unitCost: string; ingredient: Ingredient }>;
  }> }>("/api/v1/supplier-quotes", revision);
  const canManage = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"].includes(role);
  const eligibleRequests = requests.data?.requests.filter((request) => request.status === "SUBMITTED" && !request.purchaseOrder) ?? [];

  function chooseRequest(id: string) {
    setRequestId(id);
    const request = eligibleRequests.find((item) => item.id === id);
    setLines(request?.items.map((item) => ({
      ingredientId: item.ingredient.id,
      quantity: item.quantity,
      unitCost: "",
      ingredient: item.ingredient,
    })) ?? []);
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/supplier-quotes", {
        method: "POST",
        body: JSON.stringify({
          purchaseRequestId: requestId,
          supplierId: values.get("supplierId"),
          validUntil: values.get("validUntil") || undefined,
          note: values.get("note"),
          items: lines.map(({ ingredientId, quantity, unitCost }) => ({ ingredientId, quantity, unitCost })),
        }),
      });
      form.reset();
      setRequestId("");
      setLines([]);
      submission.setMessage("Supplier quotation recorded against the submitted request.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not record quotation.");
    } finally {
      submission.setBusy(false);
    }
  }

  async function decideQuote(id: string, action: "award" | "reject") {
    if (!window.confirm(action === "award" ? "Award this quotation and create a purchase order?" : "Reject this quotation?")) return;
    submission.setBusy(true);
    submission.setMessage("");
    submission.setIsError(false);
    try {
      await requestJson("/api/v1/supplier-quotes", { method: "PATCH", body: JSON.stringify({ id, action }) });
      submission.setMessage(action === "award" ? "Quotation awarded; the request was approved and a priced purchase order was created." : "Quotation rejected.");
      setRevision((value) => value + 1);
    } catch (reason) {
      submission.setIsError(true);
      submission.setMessage(reason instanceof Error ? reason.message : "Could not update quotation.");
    } finally {
      submission.setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Procurement" title="Supplier quotations" description="Compare supplier offers against the exact submitted request; awarding a complete quote creates a priced purchase order." action={<Link className="button-secondary" href="/procurement">Request queue →</Link>} />
      <Feedback text={submission.message} error={submission.isError} />
      {canManage && <Panel title="Record a supplier offer" description="Enter the quoted price for each requested ingredient and quantity.">
        {requests.error ? <Notice error>{requests.error}</Notice> : suppliers.error ? <Notice error>{suppliers.error}</Notice> : null}
        {!eligibleRequests.length ? <EmptyState title="Submitted requests are needed">Submit a purchase request before recording supplier quotations.</EmptyState> : (
          <form className="record-form" onSubmit={(event) => void submitQuote(event)}>
            <label>Submitted request<select required value={requestId} onChange={(event) => chooseRequest(event.target.value)}><option value="">Select request</option>{eligibleRequests.map((item) => <option key={item.id} value={item.id}>{item.campus.name} · {item.supplier.name} · {item.id.slice(0, 8)}</option>)}</select></label>
            <label>Supplier<select name="supplierId" required defaultValue=""><option value="">Select supplier</option>{suppliers.data?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <label>Valid until<input name="validUntil" type="date" /></label>
            {lines.length > 0 && <div className="record-form-wide"><strong>Quoted items</strong><TableFrame><thead><tr><th>Ingredient</th><th>Requested</th><th>Unit price</th></tr></thead><tbody>
              {lines.map((line, index) => <tr key={line.ingredientId}><td>{line.ingredient.name} ({line.ingredient.unit})</td><td>{line.quantity}</td><td><input aria-label={`${line.ingredient.name} quoted unit price`} type="number" min="0" step="0.0001" required value={line.unitCost} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, unitCost: event.target.value } : item))} /></td></tr>)}
            </tbody></TableFrame></div>}
            <label className="record-form-wide">Quote note<input name="note" maxLength={500} /></label>
            <div className="form-actions"><button className="button-primary" disabled={submission.busy || !lines.length}>{submission.busy ? "Saving…" : "Record quotation"}</button></div>
          </form>
        )}
      </Panel>}
      <Panel title="Quotation comparison" description="Awarding one complete quote rejects other submitted quotes for the same request.">
        {quotes.error ? <Notice error>{quotes.error}</Notice> : quotes.loading ? <LoadingState /> : !quotes.data?.quotes.length ? <EmptyState title="No quotations recorded">Record offers against submitted requests to compare suppliers.</EmptyState> : (
          <div className="purchase-request-list">{quotes.data.quotes.map((quote) => <article className="purchase-request-card" key={quote.id}>
            <div className="purchase-request-heading"><div><h3>{quote.supplier.name}</h3><p>{quote.purchaseRequest.campus.name} · request {quote.purchaseRequest.id.slice(0, 8)}{quote.validUntil ? ` · valid through ${quote.validUntil.slice(0, 10)}` : ""}</p></div><StatusBadge tone={quote.status === "AWARDED" ? "positive" : quote.status === "REJECTED" ? "warning" : "neutral"}>{quote.status.toLowerCase()}</StatusBadge></div>
            {quote.note && <p className="purchase-request-note">{quote.note}</p>}
            <ul className="purchase-request-items">{quote.items.map((item) => <li key={item.id}><span>{item.ingredient.name} · {item.quantity} {item.ingredient.unit}</span><strong>{item.unitCost} / unit</strong></li>)}</ul>
            {quote.status === "SUBMITTED" && quote.purchaseRequest.status === "SUBMITTED" && canManage && <div className="purchase-actions"><button className="button-primary" disabled={submission.busy} onClick={() => void decideQuote(quote.id, "award")}>Award & create order</button><button className="button-quiet" disabled={submission.busy} onClick={() => void decideQuote(quote.id, "reject")}>Reject</button></div>}
          </article>)}</div>
        )}
      </Panel>
    </>
  );
}
