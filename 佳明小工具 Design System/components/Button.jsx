/**
 * Button Component
 * Primary action component with multiple variants and sizes
 */

export const Button = (props) => {
  const { children, variant = 'primary', size = 'md', disabled = false, onClick, className = '', ...rest } = props;

  const variantStyles = {
    primary: {
      background: 'var(--color-primary)',
      color: '#fff',
      borderColor: 'var(--color-primary)',
    },
    secondary: {
      background: 'var(--color-bg-subtle)',
      color: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border-primary)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border-primary)',
    },
    danger: {
      background: 'var(--color-error)',
      color: '#fff',
      borderColor: 'var(--color-error)',
    },
  };

  const sizeStyles = {
    sm: { padding: '4px 10px', fontSize: 'var(--font-size-xs)' },
    md: { padding: '7px 14px' },
    lg: { padding: '10px 18px', fontSize: 'var(--font-size-base)' },
  };

  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
    opacity: disabled ? 0.5 : 1,
    ...variantStyles[variant],
    ...sizeStyles[size],
  };

  return (
    <button style={baseStyles} disabled={disabled} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  );
};
