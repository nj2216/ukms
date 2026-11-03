"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  TableFrame,
} from "@/components/workspace-primitives";

type Supplier = { id: string; name: string; email: string | null; phone: string | null };
type Ingredient = { id: string; name: string; unit: string };
type Store = { id: string; name: string; type: string; campus: { id: string; name: string } };
type Campus = { id: string; name: string };
type RequestItem = {
  id: string;
  quantity: string;
  estimatedUnitCost: string | null;
  ingredient: Ingredient;
};
type PurchaseRequest = {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  campus: Campus;
  store: { id: string; name: string };
  supplier: Supplier;
  items: RequestItem[];
  purchaseOrder: { id: string; status: string } | null;
};
type OrderItem = {
  id: string;
  orderedQuantity: string;
  receivedQuantity: string;
  unitCost: string | null;
  ingredient: Ingredient;
};
type PurchaseOrder = {
  id: string;
  status: string;
  createdAt: string;
  campus: Campus;
  store: { id: string; name: string };
  supplier: Supplier;
  items: OrderItem[];
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
  return { data, error, loading };
}

export function SuppliersPage({ role }: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const suppliers = useResource<{ suppliers: Supplier[] }>("/api/v1/suppliers", refreshKey);
  const canCreate = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"].includes(role);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    setSaving(true);
    try {
      await requestJson("/api/v1/suppliers", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      form.reset();
      setMessage("Supplier added to this institution.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not create supplier.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Procurement" title="Suppliers" description="Manage the institution's supplier directory and use those suppliers on campus purchase requests." action={<Link className="button-secondary" href="/procurement">Purchase requests →</Link>} />
      {canCreate && <Panel title="Add supplier" description="Supplier details are shared within this institution only.">
        <form className="record-form" onSubmit={(event) => void createSupplier(event)}>
          <label>Supplier name<input name="name" required maxLength={191} placeholder="Company or supplier name" /></label>
          <label>Email (optional)<input name="email" type="email" maxLength={191} placeholder="orders@example.com" /></label>
          <label>Phone (optional)<input name="phone" maxLength={64} placeholder="Contact number" /></label>
          <button className="button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Add supplier"}</button>
        </form>
        {message && <Notice error={isError}>{message}</Notice>}
      </Panel>}
      <Panel title="Supplier directory">
        {suppliers.error ? <Notice error>{suppliers.error}</Notice> : suppliers.loading ? <LoadingState /> : !suppliers.data?.suppliers.length ? <EmptyState title="No suppliers yet">{canCreate ? "Add a supplier to start creating purchase requests." : "Ask an institution manager to add suppliers."}</EmptyState> : (
          <TableFrame><thead><tr><th>Supplier</th><th>Email</th><th>Phone</th><th>Scope</th></tr></thead><tbody>
            {suppliers.data.suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong></td><td>{supplier.email ?? "—"}</td><td>{supplier.phone ?? "—"}</td><td><StatusBadge>Institution</StatusBadge></td></tr>)}
          </tbody></TableFrame>
        )}
      </Panel>
    </>
  );
}

type RequestLine = { ingredientId: string; quantity: string; estimatedUnitCost: string };
type ReceiptLine = { quantity: string; batchCode: string; expiryDate: string };

export function ProcurementPage({
  role,
  assignedCampusId,
}: {
  role: string;
  assignedCampusId: string | null;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [campusId, setCampusId] = useState(assignedCampusId ?? "");
  const [requestLines, setRequestLines] = useState<RequestLine[]>([{ ingredientId: "", quantity: "", estimatedUnitCost: "" }]);
  const [receiptLines, setReceiptLines] = useState<Record<string, Record<string, ReceiptLine>>>({});
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  const receiptKeys = useRef(new Map<string, string>());
  const canRequest = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "KITCHEN_STAFF"].includes(role);
  const canApprove = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "PROCUREMENT_OFFICER"].includes(role);
  const canReceive = ["INSTITUTION_ADMIN", "CAMPUS_MANAGER", "STOREKEEPER"].includes(role);

  const campuses = useResource<{ campuses: Campus[] }>("/api/v1/campuses", 0);
  const suppliers = useResource<{ suppliers: Supplier[] }>("/api/v1/suppliers", 0);
  const ingredients = useResource<{ ingredients: Ingredient[] }>("/api/v1/ingredients", 0);
  const storesUrl = campusId ? `/api/v1/stores?campusId=${encodeURIComponent(campusId)}` : "/api/v1/stores";
  const stores = useResource<{ stores: Store[] }>(storesUrl, 0);
  const requests = useResource<{ requests: PurchaseRequest[] }>("/api/v1/purchase-requests", refreshKey);
  const orders = useResource<{ orders: PurchaseOrder[] }>("/api/v1/purchase-orders", refreshKey);

  useEffect(() => {
    if (!campusId && !assignedCampusId && campuses.data?.campuses.length === 1) {
      setCampusId(campuses.data.campuses[0].id);
    }
  }, [campusId, assignedCampusId, campuses.data]);

  useEffect(() => {
    if (assignedCampusId && campusId !== assignedCampusId) setCampusId(assignedCampusId);
  }, [assignedCampusId, campusId]);

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    setSavingRequest(true);
    const values = new FormData(form);
    try {
      await requestJson("/api/v1/purchase-requests", {
        method: "POST",
        body: JSON.stringify({
          campusId,
          storeId: values.get("storeId"),
          supplierId: values.get("supplierId"),
          note: values.get("note"),
          items: requestLines.map((line) => ({
            ...line,
            estimatedUnitCost: line.estimatedUnitCost || undefined,
          })),
        }),
      });
      form.reset();
      setRequestLines([{ ingredientId: "", quantity: "", estimatedUnitCost: "" }]);
      setMessage("Purchase request created as a draft.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not create purchase request.");
    } finally {
      setSavingRequest(false);
    }
  }

  async function updateRequest(id: string, action: "submit" | "approve" | "reject") {
    if (
      action !== "submit" &&
      !window.confirm(action === "approve"
        ? "Approve this request and create a purchase order?"
        : "Reject this purchase request?")
    ) return;
    setMessage("");
    setIsError(false);
    try {
      await requestJson("/api/v1/purchase-requests", {
        method: "PATCH",
        body: JSON.stringify({ id, action }),
      });
      setMessage(
        action === "approve"
          ? "Request approved and purchase order created."
          : action === "submit" ? "Request submitted for approval." : "Request rejected.",
      );
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not update purchase request.");
    }
  }

  async function receiveOrder(event: FormEvent<HTMLFormElement>, order: PurchaseOrder) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    setReceivingOrderId(order.id);
    const values = new FormData(form);
    const items = order.items
      .map((item) => {
        const quantity = String(values.get(`quantity:${item.id}`) ?? "");
        if (!quantity) return null;
        return {
          purchaseOrderItemId: item.id,
          quantity,
          batchCode: values.get(`batch:${item.id}`) || undefined,
          expiryDate: values.get(`expiry:${item.id}`) || undefined,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);
    if (items.length === 0) {
      setIsError(true);
      setMessage("Enter a quantity for at least one outstanding order item.");
      setReceivingOrderId(null);
      return;
    }
    const idempotencyKey = receiptKeys.current.get(order.id) ?? crypto.randomUUID();
    receiptKeys.current.set(order.id, idempotencyKey);
    try {
      await requestJson(`/api/v1/purchase-orders/${encodeURIComponent(order.id)}/receipts`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey,
          note: values.get("receiptNote"),
          items,
        }),
      });
      receiptKeys.current.delete(order.id);
      form.reset();
      setReceiptLines((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== order.id)));
      setMessage("Goods received; inventory, batches, and the stock ledger were updated.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not receive goods.");
    } finally {
      setReceivingOrderId(null);
    }
  }

  const requestReady =
    canRequest &&
    Boolean(campusId) &&
    Boolean(suppliers.data?.suppliers.length) &&
    Boolean(ingredients.data?.ingredients.length) &&
    Boolean(stores.data?.stores.length);

  return (
    <>
      <PageHeader eyebrow="Procurement" title="Purchase requests" description="Request ingredients, route them for approval, then receive approved orders directly into campus stock." action={<Link className="button-secondary" href="/procurement/suppliers">Supplier directory →</Link>} />
      {message && <Notice error={isError}>{message}</Notice>}
      {canRequest && <Panel title="Create purchase request" description="Choose a campus store, supplier, and requested quantities; the request is saved as a draft.">
        {campuses.error ? <Notice error>{campuses.error}</Notice> : suppliers.error ? <Notice error>{suppliers.error}</Notice> : ingredients.error ? <Notice error>{ingredients.error}</Notice> : stores.error ? <Notice error>{stores.error}</Notice> : null}
        {campuses.loading || suppliers.loading || ingredients.loading || stores.loading ? <LoadingState label="Loading purchasing options…" /> : !requestReady ? <EmptyState title="Purchasing setup required">{!suppliers.data?.suppliers.length ? <><span>Add a supplier first. </span><Link className="text-link" href="/procurement/suppliers">Open suppliers →</Link></> : !ingredients.data?.ingredients.length ? "Add ingredients before requesting stock." : !stores.data?.stores.length ? "Create a receiving store for this campus." : "Select an authorized campus."}</EmptyState> : (
          <form className="record-form" onSubmit={(event) => void createRequest(event)}>
            {!assignedCampusId && <label>Campus<select required value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="" disabled>Select campus</option>{campuses.data?.campuses.map((campus) => <option value={campus.id} key={campus.id}>{campus.name}</option>)}</select></label>}
            <label>Receiving store<select name="storeId" required defaultValue=""><option value="" disabled>Select store</option>{stores.data?.stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
            <label>Supplier<select name="supplierId" required defaultValue=""><option value="" disabled>Select supplier</option>{suppliers.data?.suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
            <div className="record-form-wide">
              <strong>Requested ingredients</strong>
              <div className="ingredient-lines">
                {requestLines.map((line, index) => (
                  <div className="ingredient-line procurement-line" key={index}>
                    <label>Ingredient<select required value={line.ingredientId} onChange={(event) => setRequestLines((current) => current.map((item, row) => row === index ? { ...item, ingredientId: event.target.value } : item))}><option value="" disabled>Select ingredient</option>{ingredients.data?.ingredients.map((ingredient) => <option value={ingredient.id} key={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label>
                    <label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setRequestLines((current) => current.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /></label>
                    <label>Est. unit cost<input type="number" min="0" step="0.0001" value={line.estimatedUnitCost} onChange={(event) => setRequestLines((current) => current.map((item, row) => row === index ? { ...item, estimatedUnitCost: event.target.value } : item))} /></label>
                    {requestLines.length > 1 && <button className="button-quiet ingredient-line-remove" type="button" aria-label={`Remove request item ${index + 1}`} onClick={() => setRequestLines((current) => current.filter((_, row) => row !== index))}>Remove</button>}
                  </div>
                ))}
                <button className="button-secondary" type="button" onClick={() => setRequestLines((current) => [...current, { ingredientId: "", quantity: "", estimatedUnitCost: "" }])}>Add ingredient</button>
              </div>
            </div>
            <label className="record-form-wide">Note (optional)<input name="note" maxLength={500} placeholder="Reason or required delivery date" /></label>
            <div className="form-actions"><button className="button-primary" type="submit" disabled={savingRequest}>{savingRequest ? "Saving…" : "Create draft request"}</button></div>
          </form>
        )}
      </Panel>}

      <Panel title="Request queue" description="Managers can approve submitted requests to create purchase orders; campus users can submit drafts.">
        {requests.error ? <Notice error>{requests.error}</Notice> : requests.loading ? <LoadingState /> : !requests.data?.requests.length ? <EmptyState title="No purchase requests yet">Create a request to begin the purchasing workflow.</EmptyState> : (
          <div className="purchase-request-list">
            {requests.data.requests.map((request) => (
              <article className="purchase-request-card" key={request.id}>
                <div className="purchase-request-heading">
                  <div><h3>{request.supplier.name}</h3><p>{request.campus.name} · {request.store.name} · {request.items.length} ingredient{request.items.length === 1 ? "" : "s"}</p></div>
                  <StatusBadge tone={request.status === "APPROVED" ? "positive" : request.status === "REJECTED" ? "warning" : "neutral"}>{request.status.toLowerCase()}</StatusBadge>
                </div>
                {request.note && <p className="purchase-request-note">{request.note}</p>}
                <ul className="purchase-request-items">{request.items.map((item) => <li key={item.id}><span>{item.ingredient.name}</span><strong>{item.quantity} {item.ingredient.unit}{item.estimatedUnitCost ? ` · est. ${item.estimatedUnitCost}/unit` : ""}</strong></li>)}</ul>
                {request.purchaseOrder && <p className="purchase-order-link">Purchase order <strong>{request.purchaseOrder.id}</strong> · {request.purchaseOrder.status.toLowerCase()}</p>}
                <div className="purchase-actions">
                  {request.status === "DRAFT" && <button className="button-secondary" type="button" onClick={() => void updateRequest(request.id, "submit")}>Submit for approval</button>}
                  {request.status === "SUBMITTED" && canApprove && <><button className="button-primary" type="button" onClick={() => void updateRequest(request.id, "approve")}>Approve & create order</button><button className="button-quiet" type="button" onClick={() => void updateRequest(request.id, "reject")}>Reject</button></>}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {canReceive && <Panel title="Purchase orders & receiving" description="Record full or partial delivery quantities; accepted goods are added to stock with lot and expiry details.">
        {orders.error ? <Notice error>{orders.error}</Notice> : orders.loading ? <LoadingState /> : !orders.data?.orders.length ? <EmptyState title="No purchase orders yet">Approving a submitted request creates an order here.</EmptyState> : (
          <div className="purchase-request-list">
            {orders.data.orders.map((order) => {
              const outstanding = order.items.filter((item) => Number(item.orderedQuantity) > Number(item.receivedQuantity));
              const orderReceiptLines = receiptLines[order.id] ?? {};
              return (
                <article className="purchase-request-card" key={order.id}>
                  <div className="purchase-request-heading"><div><h3>{order.supplier.name}</h3><p>{order.campus.name} · {order.store.name} · order {order.id}</p></div><StatusBadge tone={order.status === "RECEIVED" ? "positive" : order.status === "PARTIALLY_RECEIVED" ? "warning" : "neutral"}>{order.status.toLowerCase()}</StatusBadge></div>
                  {outstanding.length > 0 && <form className="receipt-form" onSubmit={(event) => void receiveOrder(event, order)}>
                    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Ingredient</th><th>Ordered</th><th>Received</th><th>Receive now</th><th>Batch code</th><th>Expiry</th></tr></thead><tbody>
                      {outstanding.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.ingredient.name}</strong><small>{item.ingredient.unit}</small></td>
                          <td>{item.orderedQuantity}</td><td>{item.receivedQuantity}</td>
                          <td><input aria-label={`Receive ${item.ingredient.name} quantity`} name={`quantity:${item.id}`} type="number" min="0.001" max={Number(item.orderedQuantity) - Number(item.receivedQuantity)} step="0.001" value={orderReceiptLines[item.id]?.quantity ?? ""} onChange={(event) => setReceiptLines((current) => ({ ...current, [order.id]: { ...current[order.id], [item.id]: { ...current[order.id]?.[item.id], quantity: event.target.value } } }))} /></td>
                          <td><input aria-label={`${item.ingredient.name} batch code`} name={`batch:${item.id}`} maxLength={100} value={orderReceiptLines[item.id]?.batchCode ?? ""} onChange={(event) => setReceiptLines((current) => ({ ...current, [order.id]: { ...current[order.id], [item.id]: { ...current[order.id]?.[item.id], batchCode: event.target.value } } }))} /></td>
                          <td><input aria-label={`${item.ingredient.name} expiry date`} name={`expiry:${item.id}`} type="date" value={orderReceiptLines[item.id]?.expiryDate ?? ""} onChange={(event) => setReceiptLines((current) => ({ ...current, [order.id]: { ...current[order.id], [item.id]: { ...current[order.id]?.[item.id], expiryDate: event.target.value } } }))} /></td>
                        </tr>
                      ))}
                    </tbody></table></div>
                    <label className="receipt-note">Receipt note (optional)<input name="receiptNote" maxLength={500} placeholder="Delivery note or discrepancy" /></label>
                    <button className="button-primary" type="submit" disabled={receivingOrderId === order.id}>{receivingOrderId === order.id ? "Recording receipt…" : "Record goods receipt"}</button>
                  </form>}
                  {outstanding.length === 0 && <p className="purchase-request-note">This order has been fully received.</p>}
                </article>
              );
            })}
          </div>
        )}
      </Panel>}
    </>
  );
}
