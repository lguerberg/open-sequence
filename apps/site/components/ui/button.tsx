import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * shadcn's Button, restyled for the system: pills, uppercase, tracked. `primary` is ink on paper
 * (paper on ink in dark), never a colour; `outline` is the hairline; `link` is the uppercase
 * underlined "Learn more".
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans font-medium uppercase transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: 'rounded-full bg-foreground text-background hover:bg-foreground/85',
        outline: 'rounded-full border border-border bg-transparent text-foreground hover:bg-surface-2',
        ghost: 'rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        link: 'rounded-none border-b border-current pb-0.5 text-foreground hover:text-brand',
      },
      size: {
        sm: 'h-8 px-3.5 text-[12px] tracking-[0.04em]',
        md: 'h-10 px-5 text-[13px] tracking-[0.04em]',
        lg: 'h-12 px-6 text-[14px] tracking-[0.04em]',
        icon: 'size-9 rounded-full',
        inline: 'h-auto px-0 text-[12px] tracking-[0.06em]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
