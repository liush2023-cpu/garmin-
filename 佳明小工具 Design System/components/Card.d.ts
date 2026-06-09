export interface CardProps {
  children: React.ReactNode;
  elevation?: 'xs' | 'sm' | 'md' | 'lg';
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  [key: string]: any;
}

export function Card(props: CardProps): React.ReactElement;
