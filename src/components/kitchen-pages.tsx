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

type Ingredient = { id: string; name: string; unit: string };
type RecipeIngredient = { quantity: string; ingredient: Ingredient };
type RecipeVersion = {
  id: string;
  versionNumber: number;
  servingYield: number;
  createdAt?: string;
  ingredients: RecipeIngredient[];
};
type Recipe = {
  id: string;
  name: string;
  description: string | null;
  versions: RecipeVersion[];
};
type MenuPlan = {
  id: string;
  name: string;
  mealType: string;
  serviceDate: string;
  status: string;
  campus: { id: string; name: string };
  items: Array<{
    id: string;
    plannedServings: number;
    recipeVersion: { id: string; versionNumber: number; recipe: { id: string; name: string } };
  }>;
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

type IngredientLine = { ingredientId: string; quantity: string };

function RecipeEditor({
  recipe,
  ingredients,
  onSaved,
  onCancel,
}: {
  recipe: Recipe | null;
  ingredients: Ingredient[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<IngredientLine[]>([{ ingredientId: "", quantity: "" }]);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    setSaving(true);
    const values = new FormData(form);
    const body = {
      name: recipe ? undefined : values.get("name"),
      description: recipe ? undefined : values.get("description"),
      servingYield: values.get("servingYield"),
      ingredients: lines,
    };
    try {
      await requestJson(
        recipe ? `/api/v1/recipes/${encodeURIComponent(recipe.id)}/versions` : "/api/v1/recipes",
        { method: "POST", body: JSON.stringify(body) },
      );
      setLines([{ ingredientId: "", quantity: "" }]);
      form.reset();
      onSaved(recipe ? `Version added to ${recipe.name}.` : "Recipe created with its first version.");
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not save this recipe.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title={recipe ? `New version · ${recipe.name}` : "Create recipe"}
      description={recipe ? "Recipe versions are immutable so existing menus retain their original quantities." : "Set the serving yield and quantities for one complete recipe version."}
      action={recipe ? <button className="button-quiet" type="button" onClick={onCancel}>Cancel</button> : undefined}
    >
      <form className="record-form" onSubmit={(event) => void submit(event)}>
        {!recipe && <>
          <label>Recipe name<input name="name" required maxLength={191} placeholder="e.g. Vegetable stew" /></label>
          <label>Description<input name="description" maxLength={500} placeholder="Optional preparation notes" /></label>
        </>}
        <label>Serving yield<input name="servingYield" type="number" min="1" max="1000000" step="1" required placeholder="Servings per recipe" /></label>
        <div className="record-form-wide">
          <strong>Ingredients and quantities</strong>
          <div className="ingredient-lines">
            {lines.map((line, index) => (
              <div className="ingredient-line" key={index}>
                <label>Ingredient<select required value={line.ingredientId} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, ingredientId: event.target.value } : item))}><option value="" disabled>Select ingredient</option>{ingredients.map((ingredient) => <option value={ingredient.id} key={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label>
                <label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /></label>
                {lines.length > 1 && <button className="button-quiet ingredient-line-remove" type="button" aria-label={`Remove ingredient row ${index + 1}`} onClick={() => setLines((current) => current.filter((_, row) => row !== index))}>Remove</button>}
              </div>
            ))}
            <button className="button-secondary" type="button" onClick={() => setLines((current) => [...current, { ingredientId: "", quantity: "" }])}>Add ingredient</button>
          </div>
        </div>
        <div className="form-actions"><button className="button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : recipe ? "Save recipe version" : "Create recipe"}</button></div>
      </form>
      {message && <Notice error={isError}>{message}</Notice>}
    </Panel>
  );
}

export function RecipesPage({ role }: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [versionTarget, setVersionTarget] = useState<Recipe | null>(null);
  const [notice, setNotice] = useState("");
  const ingredients = useResource<{ ingredients: Ingredient[] }>("/api/v1/ingredients", 0);
  const recipes = useResource<{ recipes: Recipe[] }>("/api/v1/recipes", refreshKey);
  const canManage = role === "INSTITUTION_ADMIN" || role === "CAMPUS_MANAGER";
  const ingredientList = ingredients.data?.ingredients ?? [];

  return (
    <>
      <PageHeader eyebrow="Kitchen & meal planning" title="Recipes" description="Maintain versioned ingredient quantities and serving yields for menu planning." action={<Link className="button-secondary" href="/kitchen/menus">Meal plans →</Link>} />
      {notice && <Notice>{notice}</Notice>}
      {canManage && (ingredients.error ? <Notice error>{ingredients.error}</Notice> : ingredients.loading ? <LoadingState label="Loading the ingredient catalog…" /> : ingredientList.length === 0 ? <Panel title="Recipe setup required"><EmptyState title="Add ingredients first"><Link className="text-link" href="/inventory/ingredients">Open the ingredient catalog →</Link></EmptyState></Panel> : (
        <RecipeEditor
          key={versionTarget?.id ?? "new-recipe"}
          recipe={versionTarget}
          ingredients={ingredientList}
          onSaved={(message) => { setNotice(message); setVersionTarget(null); setRefreshKey((key) => key + 1); }}
          onCancel={() => setVersionTarget(null)}
        />
      ))}
      <Panel title="Recipe catalog" description="Menus retain the exact recipe version selected during planning.">
        {recipes.error ? <Notice error>{recipes.error}</Notice> : recipes.loading ? <LoadingState /> : !recipes.data?.recipes.length ? <EmptyState title="No recipes yet">{canManage ? "Create a recipe above to make it available for meal planning." : "Ask an institution administrator to create recipes."}</EmptyState> : (
          <div className="recipe-list">
            {recipes.data.recipes.map((recipe) => (
              <article className="recipe-card" key={recipe.id}>
                <div className="recipe-card-heading"><div><h3>{recipe.name}</h3>{recipe.description && <p>{recipe.description}</p>}</div>{canManage && <button className="button-secondary" type="button" onClick={() => { setNotice(""); setVersionTarget(recipe); }}>Add version</button>}</div>
                {recipe.versions.length === 0 ? <EmptyState title="No recipe versions" /> : recipe.versions.map((version) => (
                  <div className="recipe-version" key={version.id}>
                    <div className="recipe-version-heading"><StatusBadge>Version {version.versionNumber}</StatusBadge><span>Yield: {version.servingYield} servings</span></div>
                    <ul>{version.ingredients.map((item) => <li key={item.ingredient.id}>{item.ingredient.name}<span>{item.quantity} {item.ingredient.unit}</span></li>)}</ul>
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

type MenuLine = { recipeVersionId: string; plannedServings: string };

export function MenuPlansPage({ role }: { role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lines, setLines] = useState<MenuLine[]>([{ recipeVersionId: "", plannedServings: "" }]);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [campusId, setCampusId] = useState("");
  const campuses = useResource<{ campuses: Array<{ id: string; name: string }> }>("/api/v1/campuses", 0);
  const recipes = useResource<{ recipes: Recipe[] }>("/api/v1/recipes", 0);
  const plans = useResource<{ menuPlans: MenuPlan[] }>("/api/v1/menu-plans", refreshKey);
  const canPlan = role === "INSTITUTION_ADMIN" || role === "CAMPUS_MANAGER" || role === "KITCHEN_STAFF";

  useEffect(() => {
    if (!campusId && campuses.data?.campuses.length === 1) setCampusId(campuses.data.campuses[0].id);
  }, [campusId, campuses.data]);

  const versions = (recipes.data?.recipes ?? []).flatMap((recipe) =>
    recipe.versions.map((version) => ({ ...version, recipeName: recipe.name })),
  );

  async function createMenuPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setIsError(false);
    setSaving(true);
    const values = new FormData(form);
    try {
      await requestJson("/api/v1/menu-plans", {
        method: "POST",
        body: JSON.stringify({
          name: values.get("name"),
          campusId,
          mealType: values.get("mealType"),
          serviceDate: values.get("serviceDate"),
          items: lines.map((line) => ({ ...line, plannedServings: Number(line.plannedServings) })),
        }),
      });
      form.reset();
      setLines([{ recipeVersionId: "", plannedServings: "" }]);
      setMessage("Meal plan saved as a draft.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setIsError(true);
      setMessage(reason instanceof Error ? reason.message : "Could not save the meal plan.");
    } finally {
      setSaving(false);
    }
  }

  const canLoadForm = canPlan && campuses.data?.campuses.length && versions.length;
  return (
    <>
      <PageHeader eyebrow="Kitchen & meal planning" title="Meal plans" description="Schedule meals by campus and calculate ingredient demand from pinned recipe versions." action={<Link className="button-secondary" href="/kitchen/recipes">Recipe catalog →</Link>} />
      {canPlan && (campuses.error ? <Notice error>{campuses.error}</Notice> : recipes.error ? <Notice error>{recipes.error}</Notice> : campuses.loading || recipes.loading ? <LoadingState label="Loading campuses and recipes…" /> : !canLoadForm ? <Panel title="Planning setup required"><EmptyState title={!campuses.data?.campuses.length ? "No campus available" : "No recipes available"}>{!campuses.data?.campuses.length ? "Add a campus before scheduling a meal." : "Create a recipe and version before scheduling a meal."}</EmptyState></Panel> : (
        <Panel title="Schedule a meal" description="Each plan starts as a draft. Ingredient requirements are calculated from the selected recipe versions.">
          <form className="record-form" onSubmit={(event) => void createMenuPlan(event)}>
            <label>Meal name<input name="name" required maxLength={191} placeholder="e.g. Monday lunch" /></label>
            <label>Campus<select required value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="" disabled>Select campus</option>{campuses.data?.campuses.map((campus) => <option value={campus.id} key={campus.id}>{campus.name}</option>)}</select></label>
            <label>Meal type<select name="mealType" defaultValue="LUNCH"><option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACK">Snack</option></select></label>
            <label>Service date<input name="serviceDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <div className="record-form-wide">
              <strong>Menu items</strong>
              <div className="ingredient-lines">
                {lines.map((line, index) => (
                  <div className="ingredient-line" key={index}>
                    <label>Recipe version<select required value={line.recipeVersionId} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, recipeVersionId: event.target.value } : item))}><option value="" disabled>Select recipe version</option>{versions.map((version) => <option value={version.id} key={version.id}>{version.recipeName} · v{version.versionNumber} · yield {version.servingYield}</option>)}</select></label>
                    <label>Planned servings<input required type="number" min="1" max="1000000" step="1" value={line.plannedServings} onChange={(event) => setLines((current) => current.map((item, row) => row === index ? { ...item, plannedServings: event.target.value } : item))} /></label>
                    {lines.length > 1 && <button className="button-quiet ingredient-line-remove" type="button" aria-label={`Remove menu row ${index + 1}`} onClick={() => setLines((current) => current.filter((_, row) => row !== index))}>Remove</button>}
                  </div>
                ))}
                <button className="button-secondary" type="button" onClick={() => setLines((current) => [...current, { recipeVersionId: "", plannedServings: "" }])}>Add menu item</button>
              </div>
            </div>
            <div className="form-actions"><button className="button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft meal plan"}</button></div>
          </form>
          {message && <Notice error={isError}>{message}</Notice>}
        </Panel>
      ))}
      {!canPlan && <Notice error>You do not have permission to create or view meal plans.</Notice>}
      <Panel title="Scheduled meals" description="Open a plan to review its recipe versions and current stock availability.">
        {plans.error ? <Notice error>{plans.error}</Notice> : plans.loading ? <LoadingState /> : !plans.data?.menuPlans.length ? <EmptyState title="No meal plans yet">Create a draft plan to calculate ingredient requirements.</EmptyState> : (
          <TableFrame><thead><tr><th>Service date</th><th>Meal</th><th>Campus</th><th>Menu</th><th>Recipes</th><th>Status</th></tr></thead><tbody>
            {plans.data.menuPlans.map((plan) => <tr key={plan.id}><td>{plan.serviceDate.slice(0, 10)}</td><td>{plan.mealType.toLowerCase()}</td><td>{plan.campus.name}</td><td><Link className="text-link" href={`/kitchen/menus/${plan.id}`}>{plan.name} →</Link></td><td>{plan.items.length}</td><td><StatusBadge>{plan.status.toLowerCase()}</StatusBadge></td></tr>)}
          </tbody></TableFrame>
        )}
      </Panel>
    </>
  );
}

type Requirements = {
  menuPlan: { name: string; mealType: string; serviceDate: string; status: string; campus: { name: string } };
  requirements: Array<{ id: string; name: string; unit: string; required: string; available: string; expired: string; shortage: string; sufficient: boolean }>;
  availabilityNote: string;
};

export function MenuRequirementsPage({ menuPlanId, role }: { menuPlanId: string; role: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [publishMessage, setPublishMessage] = useState("");
  const [publishError, setPublishError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const result = useResource<Requirements>(`/api/v1/menu-plans/${encodeURIComponent(menuPlanId)}/requirements`, refreshKey);
  const requirement = result.data;
  const shortageCount = requirement?.requirements.filter((item) => !item.sufficient).length ?? 0;
  const canPublish = role === "INSTITUTION_ADMIN" || role === "CAMPUS_MANAGER";

  async function publishMenu() {
    setPublishing(true);
    setPublishMessage("");
    setPublishError(false);
    try {
      await requestJson(`/api/v1/menu-plans/${encodeURIComponent(menuPlanId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "publish" }),
      });
      setPublishMessage("Meal plan published.");
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      setPublishError(true);
      setPublishMessage(reason instanceof Error ? reason.message : "Could not publish the meal plan.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Kitchen & meal planning" title={requirement?.menuPlan.name ?? "Ingredient requirements"} description="Calculated from the pinned recipe versions and eligible stock in the selected campus." action={<div className="action-group">{requirement?.menuPlan.status === "DRAFT" && canPublish && <button className="button-primary" type="button" disabled={publishing} onClick={() => void publishMenu()}>{publishing ? "Publishing…" : "Publish menu"}</button>}<Link className="button-secondary" href="/kitchen/menus">All meal plans →</Link></div>} />
      {publishMessage && <Notice error={publishError}>{publishMessage}</Notice>}
      {result.error ? <Notice error>{result.error}</Notice> : result.loading ? <LoadingState label="Calculating ingredient requirements…" /> : requirement && (
        <>
          <div className="metric-grid metric-grid-compact">
            <article className="metric-card"><span>Campus</span><strong>{requirement.menuPlan.campus.name}</strong><small>{requirement.menuPlan.serviceDate.slice(0, 10)} · {requirement.menuPlan.mealType.toLowerCase()}</small></article>
            <article className={`metric-card${shortageCount ? " metric-warning" : ""}`}><span>Short ingredients</span><strong>{shortageCount}</strong><small>Based on non-expired stock available on this campus</small></article>
            <article className="metric-card metric-link-card"><span>Next step</span><strong>Review stock</strong><small>Receipt and issue workflows update the live balance</small><Link href="/inventory">Open inventory →</Link></article>
          </div>
          <Panel title="Ingredient requirements" description={requirement.availabilityNote}>
            {requirement.requirements.length === 0 ? <EmptyState title="No ingredients in this plan" /> : (
              <TableFrame><thead><tr><th>Ingredient</th><th>Required</th><th>Available</th><th>Expired stock excluded</th><th>Shortage</th><th>Status</th></tr></thead><tbody>
                {requirement.requirements.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.unit}</small></td><td>{item.required} {item.unit}</td><td>{item.available} {item.unit}</td><td>{item.expired} {item.unit}</td><td>{item.shortage} {item.unit}</td><td><StatusBadge tone={item.sufficient ? "positive" : "warning"}>{item.sufficient ? "Available" : "Shortage"}</StatusBadge></td></tr>)}
              </tbody></TableFrame>
            )}
          </Panel>
          {shortageCount > 0 && <Notice error>Shortages are calculated, but procurement and stock reservation are not available yet. No stock has been reserved or changed.</Notice>}
        </>
      )}
    </>
  );
}
