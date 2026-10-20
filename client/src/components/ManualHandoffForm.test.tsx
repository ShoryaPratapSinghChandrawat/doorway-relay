/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ManualHandoffForm } from './ManualHandoffForm';

describe('manual handoff form', () => {
  it('requires a meaningful summary and prevents submit until valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ManualHandoffForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create manual handoff' }));
    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/what needs attention/i), { target: { value: 'Meet a visitor at the entrance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create manual handoff' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      category: 'other', priority: 'normal', summary: 'Meet a visitor at the entrance', dueAt: null,
    })));
  });
});
