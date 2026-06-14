import type { CSSProperties, ReactNode } from 'react';
import { SFIcon } from './SFIcon';

interface SFButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  icon?: string;
  iconRight?: string;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}

const VARIANTS = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    border: 'none',
  },
  secondary: {
    background: 'var(--surface-3)',
    color: 'var(--text)',
    border: '1px solid var(--border-2)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-2)',
    border: '1px solid transparent',
  },
};

export function SFButton({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  children,
  onClick,
  disabled,
  className = '',
  style: styleProp,
  type = 'button',
}: SFButtonProps) {
  const v = VARIANTS[variant];
  const iconSize = size === 'sm' ? 13 : 15;
  const padding = size === 'sm' ? '5px 10px' : '7px 14px';
  const fontSize = size === 'sm' ? 11 : 12;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding,
        borderRadius: 'var(--radius-sm)',
        border: v.border,
        background: v.background,
        color: v.color,
        fontSize,
        fontFamily: 'var(--ff-text)',
        fontWeight: 500,
        letterSpacing: '0.02em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: 'opacity 0.15s',
        ...styleProp,
      }}
    >
      {icon && <SFIcon name={icon} size={iconSize} />}
      {children}
      {iconRight && <SFIcon name={iconRight} size={iconSize} />}
    </button>
  );
}
