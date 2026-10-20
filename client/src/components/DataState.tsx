import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="state-panel" role="status"><LoaderCircle className="spin" size={19} aria-hidden="true" /><span>{label}</span></div>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Inbox size={22} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <div><strong>Couldn’t load this view</strong><p>{message}</p></div>
      <button className="button button-quiet" onClick={onRetry}>Try again</button>
    </div>
  );
}
