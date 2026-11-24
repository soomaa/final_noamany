import { Children, isValidElement, type ReactNode } from 'react';

/** One entry of a dropdown, in the shape `Combobox` wants it. */
export type SelectOption = { value: string; label: string };

/**
 * Flattens `<option>` elements out of whatever a call site passed — including the fragments
 * and `{list.map(...)}` arrays they are usually built from, and `<optgroup>`, whose label is
 * dropped because a flat searchable list does not need the heading.
 *
 * This exists so a native `<select>` can become a searchable Combobox without rewriting the
 * options into an array at every one of the app's call sites.
 */
export function optionsFrom(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const walk = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as { value?: unknown; children?: ReactNode };
      if (child.type === 'option') {
        out.push({ value: String(props.value ?? ''), label: textOf(props.children) });
        return;
      }
      // Fragments and <optgroup> only wrap the options; look inside them.
      if (props.children != null) walk(props.children);
    });
  };
  walk(children);
  return out;
}

/** An option's visible text, joining the pieces when its label is interpolated. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}
