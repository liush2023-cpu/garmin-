/**
 * Input Component
 * Text input field with consistent styling
 */

export const Input = (props) => {
  const { type = 'text', placeholder = '', value, onChange, disabled = false, size = 'md', className = '', ...rest } = props;

  const sizeStyles = {
    sm: { padding: '4px 8px', fontSize: 'var(--font-size-xs)' },
    md: { padding: '7px 10px', fontSize: 'var(--font-size-base)' },
    lg: { padding: '10px 12px', fontSize: 'var(--font-size-base)' },
  };

  const styles = {
    width: '100%',
    border: '1px solid var(--color-border-primary)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg-secondary)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-sans)',
    outline: 'none',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    ...sizeStyles[size],
  };

  return (
    <input type={type} placeholder={placeholder} value={value} onChange={onChange} disabled={disabled} style={styles} className={className} {...rest} />
  );
};
