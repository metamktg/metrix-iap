import { useEffect, useState } from 'react';
import {
  animate as fmAnimate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'framer-motion';

const PHASES = [
  'INITIALIZING',
  'CALIBRATING SENSORS',
  'SYNCING DATA STREAMS',
  'RENDERING DECK',
  'COMMAND DECK ONLINE',
];

/**
 * Persistent terminal readout + power-up progress bar.
 * The mono microlabel steps through boot phases keyed to currentScene
 * (all labels always in the DOM, only opacity animates — no layout jump).
 * The progress bar fills over a 4s loop, matching the video loop so the
 * reset back to 0% happens exactly at the loop boundary.
 */
export function ProgressReadout({ currentScene }: { currentScene: number }) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -13vw)',
        width: '22vw',
      }}
    >
      {/* Everything fades out as the deck comes online and fades back in at
          the next boot cycle, so the loop's first and last frames match
          (no visible label/percent snap at the boundary). */}
      <motion.div
        className="w-full flex flex-col items-center"
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 4,
          times: [0, 0.08, 0.86, 1],
          repeat: Infinity,
          ease: 'linear',
        }}
      >
      {/* Terminal microlabel row */}
      <div
        className="mx-mono flex items-center justify-center"
        style={{ height: '1.6vw', marginBottom: '0.9vw' }}
      >
        <motion.span
          className="inline-block rounded-full"
          style={{
            width: '0.5vw',
            height: '0.5vw',
            marginRight: '0.7vw',
            background: '#16d9ff',
            boxShadow: '0 0 8px rgba(22,217,255,0.9)',
          }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative" style={{ height: '1.4vw', minWidth: '15vw' }}>
          {PHASES.map((label, i) => (
            <motion.span
              key={label}
              className="absolute left-0 top-0 whitespace-nowrap"
              style={{
                color: 'var(--mx-text-muted)',
                fontSize: '0.95vw',
                letterSpacing: '0.28em',
              }}
              animate={
                currentScene === i
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: currentScene > i ? -6 : 6 }
              }
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {label}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Progress track */}
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
        className="mx-mono"
        style={{
          marginTop: '0.7vw',
          color: 'var(--mx-text-primary)',
          fontSize: '0.8vw',
          letterSpacing: '0.2em',
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
