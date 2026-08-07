import { motion } from 'framer-motion';

const logo = `${import.meta.env.BASE_URL}metrix-logo.png`;

/**
 * Persistent Metrix logo mark, centered.
 * Pulses on a 4s loop (matching the video loop) — instruments breathing.
 * Concentric scan rings + a sweeping arc read as "coming online".
 */
export function LogoCore() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="relative flex items-center justify-center"
        style={{ width: '30vw', height: '30vw' }}
      >
        {/* Outer faint ring */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid rgba(120,170,255,0.16)',
          }}
          animate={{ scale: [0.96, 1.04, 0.96], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Mid ring */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '74%',
            height: '74%',
            border: '1px solid rgba(22,217,255,0.22)',
          }}
          animate={{ scale: [1.02, 0.97, 1.02], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Rotating scan arc — a bright cyan sweep circling the mark */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: '86%',
            height: '86%',
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(22,217,255,0.55) 350deg, rgba(98,230,255,0.9) 360deg)',
            maskImage:
              'radial-gradient(circle, transparent 46%, black 47%, black 50%, transparent 51%)',
            WebkitMaskImage:
              'radial-gradient(circle, transparent 46%, black 47%, black 50%, transparent 51%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />

        {/* Core glow behind logo */}
        <motion.div
          className="absolute rounded-full blur-2xl"
          style={{
            width: '62%',
            height: '62%',
            background:
              'radial-gradient(circle, rgba(21,93,255,0.5), rgba(22,217,255,0.18) 55%, transparent 72%)',
          }}
          animate={{ scale: [0.9, 1.12, 0.9], opacity: [0.55, 0.95, 0.55] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* The Metrix logo mark — assembles/pulses */}
        <motion.img
          src={logo}
          alt="Metrix"
          className="mx-logo-glow relative"
          style={{ width: '52%', height: '52%', objectFit: 'contain' }}
          animate={{ scale: [0.97, 1.03, 0.97] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
