import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /** When inside a Dialog, pass the dialog element so the portal renders within it,
     *  preventing the Dialog's FocusScope from stealing focus away from child inputs. */
    container?: HTMLElement | null;
  }
>(({ className, align = 'center', sideOffset = 4, container, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // Popovers are portalled outside modal DialogContent. Dialogs disable
        // pointer events on the rest of the page, so the portal must explicitly
        // opt back in and sit above the modal layer for its options to be clickable.
        'pointer-events-auto z-[60] w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-fade-in',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
