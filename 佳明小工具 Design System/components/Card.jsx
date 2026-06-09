/**
 * Card Component
 * Container for grouped content with optional elevation
 */

export const Card = (props) => {
  const { children, elevation = 'md', padding = 'md', className = '', onClick, ...rest } = props;

  const elevationMap = {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-card)',
    lg: 'var(--shadow-md)',
  };

  const paddingMap = {
    sm: 'var(--space-6)',
    md: 'var(--space-8)',
    lg: 'var(--space-12)',
  };

  const styles = {
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-primary)',
    padding: paddingMap[padding] || paddingMap.md,
    boxShadow: elevationMap[elevation] || elevationMap.md,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'box-shadow 0.12s, background 0.12s',
  };

  return (
    <div style={styles} className={className} onClick={onClick} {...rest}>
      {children}
    </div>
  );
};
