import { motion } from 'framer-motion';

const logo = `${import.meta.env.BASE_URL}metrix-logo.png`;

/**
 * Persistent Metrix logo mark — an inline element (not a full-screen
 * overlay) so it can sit to the left of the rotating callout text as one
 * anchored group, per the live boot loader layout (MetrixBootLoader.tsx).
 * A soft ambient glow plus a subtle breathing pulse on the mark itself —
 * no orbital ring or rotating scan arc, kept calm and glare-free.
 */
export function LogoCore({ size = '9vw' }: { size?: string }) {
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {/* Soft, static ambient glow behind the logo */}
      <motion.div
        className="absolute rounded-full blur-2xl"
        style={{
          width: '58%',
          height: '58%',
          background:
            'radial-gradient(circle, rgba(21,93,255,0.4), rgba(22,217,255,0.12) 55%, transparent 72%)',
        }}
        animate={{ scale: [0.98, 1.05, 0.98], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* The Metrix logo mark — a calm, slow breathing pulse */}
      <motion.img
        src={logo}
        alt="Metrix"
        className="mx-logo-glow relative"
        style={{ width: '58%', height: '58%', objectFit: 'contain' }}
        animate={{ scale: [0.98, 1.03, 0.98], opacity: [0.88, 1, 0.88] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
