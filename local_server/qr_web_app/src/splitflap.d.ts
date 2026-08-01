import type { DetailedHTMLProps, HTMLAttributes } from 'react';

interface SplitFlapAttributes extends HTMLAttributes<HTMLElement> {
  text?: string;
  mode?: 'alpha' | 'num';
  pad?: string | number;
  step?: string | number;
  theme?: 'board' | 'bare' | 'sig' | 'ok' | 'warn';
  auto?: boolean;
}

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'split-flap': DetailedHTMLProps<SplitFlapAttributes, HTMLElement>;
    }
  }
}

export {};
