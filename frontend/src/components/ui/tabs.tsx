import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The active tab value, published by `Tabs` so `TabsContent` can tell whether it
 * is the visible panel without reaching into Radix's private scope context.
 */
const TabsActiveValueContext = React.createContext<string | undefined>(undefined);

/**
 * Wraps Radix `Tabs.Root` and mirrors the active value into context. Works for both
 * controlled (`value`) and uncontrolled (`defaultValue`) usage.
 */
const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, ...props }, ref) => {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const active = value !== undefined ? value : uncontrolled;
  const handleValueChange = React.useCallback(
    (next: string) => {
      setUncontrolled(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  return (
    <TabsActiveValueContext.Provider value={active}>
      <TabsPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...props}
      />
    </TabsActiveValueContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 w-full items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground sm:w-auto',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/**
 * Panels mount lazily on first visit, then stay mounted and are hidden with CSS.
 * Radix unmounts inactive panels by default, which throws away every filter, page,
 * scroll offset and in-flight query in the panel — coming back to a tab then looks
 * like a full page refresh. Keeping visited panels alive makes tab switching instant.
 */
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, forceMount, ...props }, ref) => {
  const activeValue = React.useContext(TabsActiveValueContext);
  const visitedRef = React.useRef(false);
  if (activeValue === props.value) visitedRef.current = true;

  return (
    <TabsPrimitive.Content
      ref={ref}
      forceMount={forceMount ?? (visitedRef.current || undefined)}
      className={cn(
        'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=inactive]:hidden',
        className,
      )}
      {...props}
    />
  );
});
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
