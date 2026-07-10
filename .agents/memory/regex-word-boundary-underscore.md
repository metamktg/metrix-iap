---
name: Regex \b boundary breaks on underscore-adjacent tokens
description: Extracting ID codes/tokens from filenames like "CR1234_final.mp4" silently fails with \b because underscore is a \w character
---

`\b` (word boundary) only fires at a transition between `\w` and non-`\w`. Since `_` is a `\w` character, a pattern like `/[a-z]{1,4}\d{3,8}\b/i` will NOT match "cr1234" inside "cr1234_final" — there's no boundary between the digit and the underscore, so the whole match silently fails (not just trims wrong).

**Why:** Filenames/slugs conventionally use `_` and `-` as separators, but regex treats only `-` as a non-word char. Any extraction logic assuming `\b` marks "end of token" breaks specifically on the underscore-separated case, which is often the majority of real-world filenames.

**How to apply:** When extracting alnum codes/tokens from filenames or slugs, use explicit lookaround against the character class you actually consider a boundary, e.g. `(?<![a-z0-9])...(?![a-z0-9])`, so `_` and `-` count as separators. Test against underscore-joined fixtures specifically, not just hyphen/space ones.
