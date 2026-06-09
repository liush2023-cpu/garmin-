/* @ds-bundle: {"format":3,"namespace":"DesignSystem_09f98a","components":[{"name":"Badge","sourcePath":"components/Badge.jsx"},{"name":"Button","sourcePath":"components/Button.jsx"},{"name":"Card","sourcePath":"components/Card.jsx"},{"name":"Input","sourcePath":"components/Input.jsx"}],"sourceHashes":{"components/Badge.jsx":"21524be994a7","components/Button.jsx":"effbb36e17b9","components/Card.jsx":"6c6e477944db","components/Input.jsx":"a29ca2ed9ae8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_09f98a = window.DesignSystem_09f98a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge Component
 * Small semantic labels for status, type, or category
 */

const Badge = props => {
  const {
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    ...rest
  } = props;
  const variantStyles = {
    primary: {
      background: 'var(--color-primary-light)',
      color: 'var(--color-primary)',
      borderColor: 'var(--color-primary-border)'
    },
    success: {
      background: 'var(--color-success-light)',
      color: 'var(--color-success)',
      borderColor: 'var(--color-success-border)'
    },
    warning: {
      background: 'var(--color-warn-light)',
      color: 'var(--color-warn)',
      borderColor: 'var(--color-warn-border)'
    },
    error: {
      background: 'var(--color-error-light)',
      color: 'var(--color-error)',
      borderColor: 'var(--color-error-border)'
    },
    secondary: {
      background: 'var(--color-bg-subtle)',
      color: 'var(--color-text-tertiary)',
      borderColor: 'var(--color-border-primary)'
    }
  };
  const sizeStyles = {
    sm: {
      padding: '2px 6px',
      fontSize: 'var(--font-size-xs)'
    },
    md: {
      padding: '3px 8px',
      fontSize: 'var(--font-size-xs)'
    },
    lg: {
      padding: '4px 10px',
      fontSize: 'var(--font-size-sm)'
    }
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
    ...sizeStyles[size]
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: styles,
    className: className
  }, rest), children);
};
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Badge.jsx", error: String((e && e.message) || e) }); }

// components/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button Component
 * Primary action component with multiple variants and sizes
 */

const Button = props => {
  const {
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    onClick,
    className = '',
    ...rest
  } = props;
  const variantStyles = {
    primary: {
      background: 'var(--color-primary)',
      color: '#fff',
      borderColor: 'var(--color-primary)'
    },
    secondary: {
      background: 'var(--color-bg-subtle)',
      color: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border-primary)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      borderColor: 'var(--color-border-primary)'
    },
    danger: {
      background: 'var(--color-error)',
      color: '#fff',
      borderColor: 'var(--color-error)'
    }
  };
  const sizeStyles = {
    sm: {
      padding: '4px 10px',
      fontSize: 'var(--font-size-xs)'
    },
    md: {
      padding: '7px 14px'
    },
    lg: {
      padding: '10px 18px',
      fontSize: 'var(--font-size-base)'
    }
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
    ...sizeStyles[size]
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    style: baseStyles,
    disabled: disabled,
    onClick: onClick,
    className: className
  }, rest), children);
};
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Button.jsx", error: String((e && e.message) || e) }); }

// components/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card Component
 * Container for grouped content with optional elevation
 */

const Card = props => {
  const {
    children,
    elevation = 'md',
    padding = 'md',
    className = '',
    onClick,
    ...rest
  } = props;
  const elevationMap = {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-card)',
    lg: 'var(--shadow-md)'
  };
  const paddingMap = {
    sm: 'var(--space-6)',
    md: 'var(--space-8)',
    lg: 'var(--space-12)'
  };
  const styles = {
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-primary)',
    padding: paddingMap[padding] || paddingMap.md,
    boxShadow: elevationMap[elevation] || elevationMap.md,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'box-shadow 0.12s, background 0.12s'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: styles,
    className: className,
    onClick: onClick
  }, rest), children);
};
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Card.jsx", error: String((e && e.message) || e) }); }

// components/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input Component
 * Text input field with consistent styling
 */

const Input = props => {
  const {
    type = 'text',
    placeholder = '',
    value,
    onChange,
    disabled = false,
    size = 'md',
    className = '',
    ...rest
  } = props;
  const sizeStyles = {
    sm: {
      padding: '4px 8px',
      fontSize: 'var(--font-size-xs)'
    },
    md: {
      padding: '7px 10px',
      fontSize: 'var(--font-size-base)'
    },
    lg: {
      padding: '10px 12px',
      fontSize: 'var(--font-size-base)'
    }
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
    ...sizeStyles[size]
  };
  return /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    placeholder: placeholder,
    value: value,
    onChange: onChange,
    disabled: disabled,
    style: styles,
    className: className
  }, rest));
};
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/Input.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

})();
