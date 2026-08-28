import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge only knows Tailwind's own class names. The type ramp's size
// roles (text-caption, text-body, text-title, …) match its `text-<value>`
// pattern, and every unknown value there is assumed to be a COLOR — so a
// call like cn("text-caption …", "text-foreground/65") returned only the
// color: the size role was silently deleted as a "duplicate color" at
// runtime, in whichever direction lost (size after color deleted the color
// instead). Measured in the rendered app before this config existed: the
// entire sidebar nav, section rows and child links included, rendered at
// the 16px browser default with their text-caption/text-body classes
// stripped from the DOM — invisible in source review, because the classes
// are right in the file and wrong only after cn() runs.
//
// Registering the ramp's classes as the font-size group makes them merge
// against each other (last size wins, same as Tailwind's own sizes) and
// coexist with colors. The list must match the .text-* size utilities in
// artifacts/metrix-iap/src/index.css — a role added there without being
// added here silently reverts to being treated as a color.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro", "micro-num", "label", "caption", "body",
            "title", "cardtitle", "callout", "display", "section",
            "h2", "h3", "h4", "h5",
            "stat", "bignum", "hero",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
