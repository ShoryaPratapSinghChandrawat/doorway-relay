/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EmptyState, ErrorState, LoadingState } from './DataState';


describe('request-state UI', () => {
  it('renders loading, empty, error and success content accessibly', () => {
    render(<div><LoadingState label="Loading rows" /><EmptyState title="No rows" detail="Nothing to review." /><ErrorState message="Try again later." onRetry={() => undefined} /><p>Success: data loaded</p></div>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading rows');
    expect(screen.getByText('No rows')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Try again later.');
    expect(screen.getByText('Success: data loaded')).toBeInTheDocument();
  });

  it('retries after an error', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Temporary issue" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
