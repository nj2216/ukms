"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type SessionInfo = {
  name: string;
  email: string;
  institutionName: string;
  institutionSlug: string;
  campusName: string | null;
  role: string;
};

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result as T;
}

function FormField({
  label,
  name,
  type = "text",
  required = true,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input name={name} type={type} required={required} min={min} />
    </label>
  );
}

export default function Operations({
  initialized,
  session,
}: {
  initialized: boolean;
  session: SessionInfo | null;
}) {
  const [message, setMessage] = useState("");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [campusResult, storeResult, ingredientResult, inventoryResult] = await Promise.all([
        api<{ campuses: Campus[] }>("/api/v1/campuses"),
        api<{ stores: Store[] }>("/api/v1/stores"),
        api<{ ingredients: Ingredient[] }>("/api/v1/ingredients"),
        api<{ balances: Balance[] }>("/api/v1/inventory"),
      ]);
      setCampuses(campusResult.campuses);
      setStores(storeResult.stores);
      setIngredients(ingredientResult.ingredients);
      setBalances(inventoryResult.balances);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load operations.");
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    successMessage: string,
    reload = true,
  ) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const bootstrapToken = body.bootstrapToken;
    delete body.bootstrapToken;
    try {
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
        ...(bootstrapToken ? { headers: { "X-Bootstrap-Token": String(bootstrapToken) } } : {}),
      });
      form.reset();
      setMessage(successMessage);
      if (reload) setRefreshKey((key) => key + 1);
      else window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The request failed.");
    }
  }

  if (!session) {
    return (
      <section className="card auth-card">
        <h2>{initialized ? "Sign in" : "Set up your institution"}</h2>
        <p>
          {initialized
            ? "Use your institution slug and account details."
            : "Create the first institution administrator and main campus."}
        </p>
        {message && <p className="notice error">{message}</p>}
        <form
          className="form-grid"
          onSubmit={(event) =>
            void submit(
              event,
              initialized ? "/api/v1/auth/login" : "/api/v1/auth/bootstrap",
              initialized ? "Signed in." : "Setup complete.",
              false,
            )
          }
        >
          {!initialized ? (
            <>
              <FormField label="Institution name" name="institutionName" />
              <FormField label="First campus name" name="campusName" />
              <FormField label="Campus code" name="campusCode" />
              <FormField label="Your name" name="name" />
              <FormField label="One-time setup token" name="bootstrapToken" type="password" />
            </>
          ) : (
            <FormField label="Institution slug" name="institutionSlug" />
          )}
          <FormField label="Email" name="email" type="email" />
          <FormField label="Password" name="password" type="password" min="12" />
          <button className="primary" type="submit">
            {initialized ? "Sign in" : "Create institution"}
          </button>
        </form>
        {!initialized && <small>Use a unique password with at least 12 characters.</small>}
      </section>
    );
  }

  return (
    <section className="workspace">
      <div className="welcome card">
        <div>
          <p className="eyebrow">{session.institutionName}</p>
          <h2>Welcome, {session.name}</h2>
          <p>{session.campusName ?? "Institution-wide access"} · {session.role.replaceAll("_", " ")}</p>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await api("/api/v1/auth/logout", { method: "POST" });
              window.location.reload();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not sign out.");
            }
          }}
        >
          Sign out
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="columns">
        <div className="stack">
          {session.role === "INSTITUTION_ADMIN" && (
            <section className="card">
              <h3>Add campus</h3>
              <form className="form-grid compact" onSubmit={(event) => void submit(event, "/api/v1/campuses", "Campus added.")}>
                <FormField label="Campus name" name="name" />
                <FormField label="Campus code" name="code" />
                <button className="primary" type="submit">Add campus</button>
              </form>
            </section>
          )}
          <section className="card">
            <h3>Add store</h3>
            <form className="form-grid compact" onSubmit={(event) => void submit(event, "/api/v1/stores", "Store added.")}>
              <FormField label="Store name" name="name" />
              {session.role === "INSTITUTION_ADMIN" && (
                <label>
                  <span>Campus</span>
                  <select name="campusId" required>
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>Store type</span>
                <select name="type">
                  <option value="CAMPUS">Campus</option>
                  <option value="CENTRAL">Central</option>
                </select>
              </label>
              <button className="primary" type="submit">Add store</button>
            </form>
          </section>
          <section className="card">
            <h3>Add ingredient</h3>
            <form className="form-grid compact" onSubmit={(event) => void submit(event, "/api/v1/ingredients", "Ingredient added.")}>
              <FormField label="Ingredient name" name="name" />
              <FormField label="Base unit (kg, L, each)" name="unit" />
              <FormField label="Reorder level" name="reorderLevel" type="number" min="0" required={false} />
              <button className="primary" type="submit">Add ingredient</button>
            </form>
          </section>
          <section className="card">
            <h3>Record stock movement</h3>
            <form className="form-grid compact" onSubmit={(event) => void submit(event, "/api/v1/inventory/movements", "Stock movement recorded.")}>
              <label>
                <span>Store</span>
                <select name="storeId" required>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.campus.name} · {store.name}</option>)}
                </select>
              </label>
              <label>
                <span>Ingredient</span>
                <select name="ingredientId" required>
                  {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
                </select>
              </label>
              <label>
                <span>Movement</span>
                <select name="kind">
                  {session.role !== "KITCHEN_STAFF" && <option value="RECEIPT">Receipt</option>}
                  <option value="ISSUE">Issue</option>
                  {session.role !== "KITCHEN_STAFF" && (
                    <>
                      <option value="WASTE">Waste</option>
                      <option value="ADJUSTMENT">Adjustment (signed quantity)</option>
                    </>
                  )}
                </select>
              </label>
              <FormField label="Quantity" name="quantity" type="number" />
              <FormField label="Note" name="note" required={false} />
              <button className="primary" type="submit">Record movement</button>
            </form>
          </section>
        </div>
        <section className="card inventory">
          <div className="section-heading">
            <div>
              <h3>Current inventory</h3>
              <p>Balances are calculated from committed stock movements.</p>
            </div>
            <button className="secondary" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button>
          </div>
          {balances.length === 0 ? (
            <p className="empty">No stock recorded yet. Add an ingredient and record its first receipt.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Ingredient</th><th>Store</th><th>On hand</th><th>Reorder point</th><th>Status</th></tr></thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={balance.id}>
                      <td>{balance.ingredient.name}</td>
                      <td>{balance.store.campus.name} · {balance.store.name}</td>
                      <td>{balance.onHand} {balance.ingredient.unit}</td>
                      <td>{balance.ingredient.reorderLevel} {balance.ingredient.unit}</td>
                      <td><span className={balance.belowReorderLevel ? "tag low" : "tag"}>{balance.belowReorderLevel ? "Reorder" : "In range"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
