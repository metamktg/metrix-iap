import { motion } from 'framer-motion';

/**
 * Persistent foreground: corner HUD brackets plus phase readout ticks.
 * Rendered once and driven by the `phase` prop; the parent wraps it in a
 * loop-length opacity envelope so the phase 4 → 0 snap is invisible.
 */
export function HudFrame({ phase }: { phase: number }) {
  const bracket = '2.4vw';
  const thickness = '2px';
  const inset = '6vw';
  const color = 'rgba(31,143,255,0.55)';
  const cyan = 'rgba(22,217,255,0.7)';

  const corners = [
    { top: inset, left: inset, bt: true, bl: true },
    { top: inset, right: inset, bt: true, br: true },
    { bottom: inset, left: inset, bb: true, bl: true },
    { bottom: inset, right: inset, bb: true, br: true },
  ] as const;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {corners.map((c, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: bracket,
            height: bracket,
            top: 'top' in c ? c.top : undefined,
            bottom: 'bottom' in c ? c.bottom : undefined,
            left: 'left' in c ? c.left : undefined,
            right: 'right' in c ? c.right : undefined,
            borderTop: 'bt' in c && c.bt ? `${thickness} solid ${phase >= 4 ? cyan : color}` : undefined,
            borderBottom: 'bb' in c && c.bb ? `${thickness} solid ${phase >= 4 ? cyan : color}` : undefined,
            borderLeft: 'bl' in c && c.bl ? `${thickness} solid ${phase >= 4 ? cyan : color}` : undefined,
            borderRight: 'br' in c && c.br ? `${thickness} solid ${phase >= 4 ? cyan : color}` : undefined,
            filter: phase >= 4 ? 'drop-shadow(0 0 6px rgba(22,217,255,0.6))' : 'none',
          }}
        />
      ))}

      {/* Phase readout ticks along the top center */}
      <div
        className="absolute flex"
        style={{ left: '50%', top: '9vw', transform: 'translateX(-50%)', gap: '0.6vw' }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            style={{
              width: '2.4vw',
              height: '0.22vw',
              borderRadius: '999px',
            }}
            animate={{
              background: i <= phase ? '#16d9ff' : 'rgba(86,140,255,0.2)',
              boxShadow:
                i <= phase
                  ? '0 0 8px rgba(22,217,255,0.7)'
                  : '0 0 0px rgba(22,217,255,0)',
              scaleX: i <= phase ? 1 : 0.6,
            }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
      </div>
    </div>
  );
}
