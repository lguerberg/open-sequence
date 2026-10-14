import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * shadcn's Button, restyled for the system: pills, medium weight. `primary` is deep celeste;
 * `light` and `soft` sit on the celeste band; `link` is the mono underline with a celeste corner.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans font-medium tracking-[-0.01em] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-[#23689f]',
        light: 'bg-white text-foreground hover:bg-surface',
        soft: 'bg-brand-soft text-foreground hover:bg-[#d3e7f8]',
        dark: 'bg-foreground text-surface hover:bg-code',
        ghost: 'bg-surface/70 text-foreground hover:bg-surface',
        link: 'link-corner rounded-none font-mono font-normal tracking-normal text-foreground underline decoration-1 underline-offset-[5px] hover:text-brand',
      },
      size: {
        sm: 'h-10 rounded-full px-4 text-[15px]',
        md: 'h-12 rounded-full px-5 text-[16px]',
        lg: 'h-14 rounded-full px-7 text-[16px]',
        icon: 'size-10 rounded-full',
        inline: 'h-auto px-0 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
