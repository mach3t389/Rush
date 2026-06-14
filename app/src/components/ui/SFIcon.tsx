import { icons, type LucideIcon } from 'lucide-react';

interface SFIconProps {
  name: string;
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
}

export function SFIcon({ name, size = 16, color = 'currentColor', fill = 'none', strokeWidth = 1.6, className }: SFIconProps) {
  if (!name) return null;
  const iconName = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('') as keyof typeof icons;

  const Icon = icons[iconName] as LucideIcon | undefined;
  if (!Icon) return null;

  return (
    <Icon
      width={size}
      height={size}
      color={color}
      fill={fill}
      strokeWidth={strokeWidth}
      className={className}
      style={{ flexShrink: 0, display: 'block' }}
    />
  );
}
