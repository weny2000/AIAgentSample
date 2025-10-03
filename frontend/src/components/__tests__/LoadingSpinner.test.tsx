import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('should render loading spinner with default size', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('w-8', 'h-8');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render loading spinner with custom size', () => {
    render(<LoadingSpinner size="large" />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('w-12', 'h-12');
  });

  it('should render loading spinner with small size', () => {
    render(<LoadingSpinner size="small" />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('w-4', 'h-4');
  });

  it('should render loading spinner with custom text', () => {
    render(<LoadingSpinner text="Processing..." />);

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should render loading spinner without text when text is empty', () => {
    render(<LoadingSpinner text="" />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
  });

  it('should render with custom className', () => {
    render(<LoadingSpinner className="custom-class" />);

    const container = screen.getByRole('status').parentElement;
    expect(container).toHaveClass('custom-class');
  });

  it('should center the spinner by default', () => {
    render(<LoadingSpinner />);

    const container = screen.getByRole('status').parentElement;
    expect(container).toHaveClass('flex', 'items-center', 'justify-center');
  });
});