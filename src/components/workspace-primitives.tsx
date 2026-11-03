import type { ReactNode } from "react";

export function formatDateTime(value: string) {
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`feedback${error ? " feedback-error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-mark">—</span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function LoadingState({ label = "Loading records…" }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" />{label}</div>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="data-table-wrap"><table className="data-table">{children}</table></div>;
}
