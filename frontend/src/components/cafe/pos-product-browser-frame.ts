import { createElement, type ReactNode } from 'react';

interface PosProductBrowserFrameProps {
  categories: ReactNode;
  products: ReactNode;
  frameLabel: string;
  categoriesLabel: string;
  productsLabel: string;
}

export function PosProductBrowserFrame({
  categories,
  products,
  frameLabel,
  categoriesLabel,
  productsLabel,
}: PosProductBrowserFrameProps) {
  return createElement(
    'section',
    {
      'aria-label': frameLabel,
      className:
        'grid min-w-0 items-start gap-4 xl:grid-cols-[160px_minmax(0,1fr)]',
    },
    createElement(
      'div',
      {
        'aria-label': categoriesLabel,
        className:
          'max-h-32 overflow-y-auto overscroll-contain pb-3 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8rem)] xl:pb-0',
      },
      categories,
    ),
    createElement(
      'div',
      {
        'aria-label': productsLabel,
        className:
          'min-w-0',
      },
      products,
    ),
  );
}
