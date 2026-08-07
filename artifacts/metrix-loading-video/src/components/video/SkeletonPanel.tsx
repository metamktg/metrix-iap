import { motion } from 'framer-motion';

/**
 * Branded skeleton tiles echoing the app's load-state layout, but alive:
 * each tile carries a blue→cyan sweep "glint" instead of a flat grey pulse.
 * Persistent — glints run on staggered 4s loops.
 */

interface TileProps {
  w: string;
  h: string;
  delay: number;
}

function Tile({ w, h, delay }: TileProps) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: w,
        height: h,
        borderRadius: '3px',
        background: 'rgba(20,38,72,0.55)',
        border: '1px solid rgba(86,140,255,0.14)',
      }}
    >
      {/* branded sweep glint — a single 4s keyframe timeline per tile: hold
          offscreen-left until the stagger offset, sweep for 2s, hold
          offscreen-right until the loop ends. Both boundary states are fully
          outside the tile (overflow hidden), so t=0 and t=4s render
          identically and the loop has no seam. */}
      <motion.div
        className="absolute inset-y-0"
        style={{
          width: '55%',
          background:
            'linear-gradient(90deg, transparent, rgba(31,143,255,0.32) 45%, rgba(22,217,255,0.4) 55%, transparent)',
        }}
        animate={{ x: ['-160%', '-160%', '260%', '260%'], opacity: [0, 0, 1, 0, 0] }}
        transition={{
          x: {
            duration: 4,
            times: [0, delay / 4, (delay + 2) / 4, 1],
            ease: ['linear', 'easeInOut', 'linear'],
            repeat: Infinity,
          },
          opacity: {
            duration: 4,
            times: [0, delay / 4, (delay + 1) / 4, (delay + 2) / 4, 1],
            ease: 'linear',
            repeat: Infinity,
          },
        }}
      />
    </div>
  );
}

export function SkeletonPanel() {
  return (
    <div
      className="absolute flex flex-col"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, 5.5vw)', gap: '0.7vw' }}
    >
      {/* eyebrow chip */}
      <Tile w="4vw" h="0.9vw" delay={0} />
      {/* row of four narrow tiles */}
      <div className="flex" style={{ gap: '0.55vw' }}>
        <Tile w="2vw" h="3vw" delay={0.15} />
        <Tile w="2vw" h="3vw" delay={0.3} />
        <Tile w="2vw" h="3vw" delay={0.45} />
        <Tile w="2vw" h="3vw" delay={0.6} />
      </div>
      {/* two wide panels */}
      <Tile w="9.4vw" h="4.4vw" delay={0.4} />
      <Tile w="9.4vw" h="2.6vw" delay={0.7} />
    </div>
  );
}
