// Minimal shadcn-style <Textarea> primitive for slice #14.
// The rest of the project has shadcn primitives under @/components/ui,
// but <Textarea> was never added — slice #14 is the first slice that
// needs one. It mirrors the class-variance-authority pattern used
// by Input / Select.

import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-background placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
