import { useEffect, useState } from 'react';
import {
  animate as fmAnimate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'framer-motion';

import { LogoCore } from './LogoCore';

// Short, punchy Metrix callout lines — same source list as the live boot
// loader (MetrixBootLoader.tsx) — one per scene so the reference video
// stays visually consistent with the real app.
// Kept under ~48 characters so each line fits on one row or wraps into two
// balanced lines (text-wrap: balance) instead of a long line + an orphan.
const CALLOUTS = [
  'the concept code carries the creative identity.',
  'andromeda rewards diversity, punishes repetition.',
  'every winning ad leaves a variable fingerprint.',
  'metrix runs 51 variables across 9 families.',
  'your data already has the answer.',
];

/**
 * Persistent logo + terminal readout + power-up progress bar, laid out as
 * one anchored group: the logo sits to the left of the rotating callout
 * text (the text reads off of it, not floating independently), and the
 * progress bar spans the full logo+text width underneath — matching the
 * live boot loader layout (MetrixBootLoader.tsx).
 * The callout line steps through Metrix statements keyed to currentScene
 * (all lines always in the DOM, only opacity/position animates — no layout
 * jump). The progress bar fills over a 4s loop, matching the video loop so
 * the reset back to 0% happens exactly at the loop boundary.
 */
export function ProgressReadout({ currentScene }: { currentScene: number }) {
  return (
    <div
      className="absolute flex flex-col"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -13vw)',
        // Matches logo(11vw) + gap(1.5vw) + text column(14vw) exactly, so
        // the progress bar underneath lines up flush with the text's right
        // edge instead of overshooting into empty space past it.
        width: '26.5vw',
      }}
    >
      {/* Everything fades out as the deck comes online and fades back in at
          the next boot cycle, so the loop's first and last frames match
          (no visible label/percent snap at the boundary). */}
      <motion.div
        className="w-full flex flex-col gap-[0.9vw]"
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 4,
          times: [0, 0.08, 0.86, 1],
          repeat: Infinity,
          ease: 'linear',
        }}
      >
      {/* Logo anchors the left edge of the rotating callout row — sized up
          relative to the text so it reads as the dominant anchor, matching
          the live boot loader (MetrixBootLoader.tsx). */}
      <div className="flex items-center" style={{ gap: '1.5vw' }}>
        <LogoCore size="11vw" />
        <div className="relative flex items-center" style={{ height: '11vw', width: '14vw' }}>
          {CALLOUTS.map((line, i) => (
            <motion.span
              key={line}
              className="absolute left-0 right-0 text-left"
              style={{
                color: 'var(--mx-text-muted)',
                fontSize: '0.78vw',
                fontWeight: 400,
                letterSpacing: '0.01em',
                lineHeight: 1.4,
                textWrap: 'balance',
              }}
              animate={
                currentScene === i
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: currentScene > i ? -4 : 4 }
              }
              transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {line}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Progress track — spans the full logo+text width underneath */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: '0.42vw',
          borderRadius: '999px',
          background: 'rgba(86,140,255,0.14)',
          border: '1px solid rgba(86,140,255,0.16)',
        }}
      >
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{
            borderRadius: '999px',
            background:
              'linear-gradient(90deg, #155dff 0%, #1f8fff 55%, #16d9ff 100%)',
            boxShadow: '0 0 12px rgba(22,217,255,0.6)',
          }}
          animate={{ width: ['0%', '100%', '100%'] }}
          transition={{
            duration: 4,
            times: [0, 0.9, 1],
            repeat: Infinity,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
        <motion.div
          className="absolute inset-y-0"
          style={{
            width: '8%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9))',
            borderRadius: '999px',
          }}
          animate={{ left: ['-8%', '96%', '96%'] }}
          transition={{
            duration: 4,
            times: [0, 0.9, 1],
            repeat: Infinity,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      </div>

      {/* percent readout */}
      <div
        className="mx-mono text-right"
        style={{
          color: 'var(--mx-text-primary)',
          fontSize: '0.8vw',
          fontWeight: 400,
          letterSpacing: '0.04em',
        }}
      >
        <PercentCounter />
      </div>
      </motion.div>
    </div>
  );
}

/** Animated 0→100 counter; holds at 100 through the fade-out so the reset
 *  to 0 happens while the readout is invisible. */
function PercentCounter() {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${Math.round(v)}%`);
  const [text, setText] = useState('0%');

  useMotionValueEvent(rounded, 'change', (v) => setText(v));

  useEffect(() => {
    const controls = fmAnimate(mv, [0, 100, 100], {
      duration: 4,
      times: [0, 0.9, 1],
      ease: [0.4, 0, 0.2, 1],
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [mv]);

  return <span>{text}</span>;
}
