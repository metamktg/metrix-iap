import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "../../lib/utils"

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  // Portaled, like popover.tsx and tooltip.tsx. Un-portaled, the content
  // rendered inside the trigger's subtree — under the KPI tile's
  // `overflow: hidden` and the motion wrapper's transform — so the card
  // was clipped to a 2px stripe at the tile's bottom edge on every KPI
  // tile: the popover the e2e spec found "visible" (Playwright ignores
  // overflow clipping) and no reader ever saw.
  <HoverCardPrimitive.Portal>
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    collisionPadding={collisionPadding}
    className={cn(
      // The same surface popover.tsx and tooltip.tsx wear: the popover
      // ground at 95% over a blur, a soft border and the elevation scale's
      // floating step — never the stock shadow-md, which carries no inset
      // ring and made a hover card read as a different kind of surface from
      // the popover beside it. Callers used to re-state all of this on every
      // HoverCardContent to get there; now they only size it.
      "z-50 w-64 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm p-4 text-popover-foreground elevation-floating outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-hover-card-content-transform-origin]",
      className
    )}
    {...props}
  />
  </HoverCardPrimitive.Portal>
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardTrigger, HoverCardContent }
