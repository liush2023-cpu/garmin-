/**
 * Badge Component
 * Small semantic labels for status, type, or category
 */

export const Badge = (props) => {
  const { children, variant = 'primary', size = 'md', className = '', ...rest } = props;

  const variantStyles = {
    primary: {
      background: 'var(--color-primary-light)',
      color: 'var(--color-primary)',
      borderColor: 'var(--color-primary-border)',
    },
    success: {
      background: 'var(--color-success-light)',
      color: 'var(--color-success)',
      borderColor: 'var(--color-success-border)',
    },
    warning: {
      background: 'var(--color-warn-light)',
      color: 'var(--color-warn)',
      borderColor: 'var(--color-warn-border)',
    },
    error: {
      background: 'var(--color-error-light)',
      color: 'var(--color-error)',
      borderColor: 'var(--color-error-border)',
    },
    secondary: {
      background: 'var(--color-bg-subtle)',
      color: 'var(--color-text-tertiary)',
      borderColor: 'var(--color-border-primary)',
    },
  };

  const sizeStyles = {
    sm: { padding: '2px 6px', fontSize: 'var(--font-size-xs)' },
    md: { padding: '3px 8px', fontSize: 'var(--font-size-xs)' },
    lg: { padding: '4px 10px', fontSize: 'var(--font-size-sm)' },
  };

  const styles = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    border: '1px solid',
    borderRadius: 'var(--radius-full)',
    fontWeight: 'var(--font-weight-semibold)',
    whiteSpace: 'nowrap',
    ...variantStyles[variant],
    ...sizeStyles[size],
  };

  return (
    <span style={styles} className={className} {...rest}>
      {children}
    </span>
  );
};
