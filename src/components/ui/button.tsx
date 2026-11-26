import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-brand-hover active:bg-brand-pressed",
        electric: "border border-ink bg-transparent text-ink hover:bg-ink hover:text-on-brand",
        destructive: "border border-danger bg-transparent text-danger hover:bg-danger hover:text-white",
        outline: "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-surface-2",
        secondary: "bg-surface-2 text-ink hover:bg-surface-3",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        link: "text-electric underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
