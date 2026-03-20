import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import Link from "next/link";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/80",
        ghost: "px-3 py-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        outline:
          "border border-border/50 bg-transparent px-4 py-2 text-foreground hover:border-border/80 hover:bg-muted/50"
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-5 text-base"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asLink?: false;
    href?: never;
  };

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof buttonVariants> & {
    asLink: true;
    href: string;
  };

export function Button(props: ButtonProps | ButtonLinkProps) {
  const { className, variant, size } = props;

  if (props.asLink) {
    const { href, children, ...linkProps } = props;

    return (
      <Link className={cn(buttonVariants({ variant, size }), className)} href={href} {...linkProps}>
        {children}
      </Link>
    );
  }

  const { children, type = "button", ...buttonProps } = props;

  return (
    <button className={cn(buttonVariants({ variant, size }), className)} type={type} {...buttonProps}>
      {children}
    </button>
  );
}

export { buttonVariants };
