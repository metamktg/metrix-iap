import { motion } from 'framer-motion';

const atmosphere = `${import.meta.env.BASE_URL}atmosphere.png`;

/**
 * Persistent Void Navy cockpit background.
 * Lives OUTSIDE AnimatePresence so it never remounts — every animation here
 * loops on its own timeline (multiples of the ~4s video loop) so the boundary
 * between loop passes is invisible.
 */
export function CockpitBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base void-navy gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 8%, rgba(0,119,255,0.14), transparent 34%),' +
            'radial-gradient(circle at 84% 20%, rgba(22,217,255,0.06), transparent 28%),' +
            'linear-gradient(180deg, #020711 0%, #050b18 48%, #020711 100%)',
        }}
      />

      {/* Atmospheric depth texture */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: `url(${atmosphere})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          mixBlendMode: 'screen',
        }}
      />

      {/* Drifting blue glow */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: '46vw',
          height: '46vw',
          left: '20%',
          top: '4%',
          background:
            'radial-gradient(circle, rgba(21,93,255,0.34), transparent 68%)',
        }}
        animate={{ x: ['-4%', '4%', '-4%'], y: ['-3%', '3%', '-3%'], scale: [1, 1.07, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Drifting cyan glow */}
      <motion.div
        className="absolute rounded-full blur-3xl"
        style={{
          width: '34vw',
          height: '34vw',
          right: '14%',
          bottom: '6%',
          background:
            'radial-gradient(circle, rgba(22,217,255,0.22), transparent 66%)',
        }}
        animate={{ x: ['4%', '-4%', '4%'], y: ['3%', '-3%', '3%'], scale: [1.04, 0.96, 1.04] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 44px precision grid, masked toward center */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(120,170,255,0.05) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(120,170,255,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(circle at center, black 0%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(circle at center, black 0%, transparent 72%)',
        }}
      />

      {/* Grid shimmer — a soft horizontal band sweeping down across the grid */}
      <motion.div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          height: '38vh',
          background:
            'linear-gradient(180deg, transparent, rgba(22,217,255,0.10) 45%, rgba(31,143,255,0.14) 55%, transparent)',
          maskImage:
            'linear-gradient(rgba(0,0,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,1) 1px, transparent 1px)',
          WebkitMaskImage:
            'linear-gradient(rgba(0,0,0,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,1) 1px, transparent 1px)',
          maskSize: '44px 44px',
          WebkitMaskSize: '44px 44px',
          mixBlendMode: 'screen',
        }}
        animate={{ top: ['-40vh', '110vh'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />

      {/* Vignette to seat the composition in the dark cockpit */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 46%, transparent 42%, rgba(2,7,17,0.72) 100%)',
        }}
      />
    </div>
  );
}
