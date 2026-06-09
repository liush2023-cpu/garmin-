export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  [key: string]: any;
}

export function Badge(props: BadgeProps): React.ReactElement;
