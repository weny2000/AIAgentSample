import React from 'react';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../StatusBadge';

describe('StatusBadge', () => {
  it('should render success status badge', () => {
    render(<StatusBadge status="success" />);

    const badge = screen.getByText('success');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('should render error status badge', () => {
    render(<StatusBadge status="error" />);

    const badge = screen.getByText('error');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('should render warning status badge', () => {
    render(<StatusBadge status="warning" />);

    const badge = screen.getByText('warning');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800');
  });

  it('should render info status badge', () => {
    render(<StatusBadge status="info" />);

    const badge = screen.getByText('info');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-800');
  });

  it('should render pending status badge', () => {
    render(<StatusBadge status="pending" />);

    const badge = screen.getByText('pending');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('should render in-progress status badge', () => {
    render(<StatusBadge status="in-progress" />);

    const badge = screen.getByText('in-progress');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-800');
  });

  it('should render completed status badge', () => {
    render(<StatusBadge status="completed" />);

    const badge = screen.getByText('completed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('should render failed status badge', () => {
    render(<StatusBadge status="failed" />);

    const badge = screen.getByText('failed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('should render with custom text', () => {
    render(<StatusBadge status="success" text="All Good" />);

    expect(screen.getByText('All Good')).toBeInTheDocument();
    expect(screen.queryByText('success')).not.toBeInTheDocument();
  });

  it('should render with small size', () => {
    render(<StatusBadge status="success" size="small" />);

    const badge = screen.getByText('success');
    expect(badge).toHaveClass('px-2', 'py-1', 'text-xs');
  });

  it('should render with large size', () => {
    render(<StatusBadge status="success" size="large" />);

    const badge = screen.getByText('success');
    expect(badge).toHaveClass('px-4', 'py-2', 'text-base');
  });

  it('should render with default medium size', () => {
    render(<StatusBadge status="success" />);

    const badge = screen.getByText('success');
    expect(badge).toHaveClass('px-3', 'py-1', 'text-sm');
  });

  it('should have proper base styling', () => {
    render(<StatusBadge status="success" />);

    const badge = screen.getByText('success');
    expect(badge).toHaveClass(
      'inline-flex',
      'items-center',
      'rounded-full',
      'font-medium'
    );
  });

  it('should render with custom className', () => {
    render(<StatusBadge status="success" className="custom-class" />);

    const badge = screen.getByText('success');
    expect(badge).toHaveClass('custom-class');
  });

  it('should handle unknown status gracefully', () => {
    render(<StatusBadge status="unknown" as any />);

    const badge = screen.getByText('unknown');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800'); // Default styling
  });

  it('should be accessible', () => {
    render(<StatusBadge status="success" />);

    const badge = screen.getByText('success');
    expect(badge).toHaveAttribute('role', 'status');
  });
});