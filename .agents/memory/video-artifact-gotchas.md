---
name: Seamless-loop design for video artifacts
description: What the completion reviewer requires of looping video compositions
---

- Rule: in a looping video composition, the rendered frame at t=0 must equal the frame at t=loop-length. **Why:** the completion code review inspects every animation timeline and rejects the task if any visible element can differ at the boundary.
- **How to apply:**
  - Every animation's period must divide the loop length exactly (no 12s glow on a 4s loop; no 1.4s pulse).
  - Staggered/delayed repeats break the rule — `delay` + `repeatDelay` phases desynchronize the boundary. Encode offsets inside a single loop-length keyframe timeline (`times: [...]`) whose first and last states render identically.
  - Any state that snaps at the boundary (progress %, phase labels, scene-keyed layers) needs an opacity envelope that is 0 at both ends of the loop; fading one element is not enough.
  - Verify with a real capture: screenshot frames exactly one loop apart and pixel-diff (RMSE ≈ capture jitter is fine).
