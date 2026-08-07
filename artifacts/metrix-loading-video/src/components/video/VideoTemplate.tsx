// Metrix — Command Deck powering-up loading animation.
// Persistent cockpit layers loop on a 4s timeline that exactly matches the
// sum of the 5 scene durations, so the loop boundary is invisible.

import { useEffect } from 'react';

import { motion } from 'framer-motion';

import { useVideoPlayer } from '@/lib/video';

import { CockpitBackground } from './CockpitBackground';
import { LogoCore } from './LogoCore';
import { ProgressReadout } from './ProgressReadout';
import { SkeletonPanel } from './SkeletonPanel';
import { HudFrame } from './video_scenes/HudFrame';

export const SCENE_DURATIONS = {
  init: 800,
  calibrate: 800,
  sync: 800,
  render: 800,
  online: 800,
};

const SCENE_KEYS = Object.keys(SCENE_DURATIONS);

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = SCENE_KEYS.indexOf(baseSceneKey);

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ background: '#020711' }}
    >
      {/* ── Persistent layers (never remount; loop on 4s timeline) ── */}
      <CockpitBackground />
      <SkeletonPanel />
      <LogoCore />
      <ProgressReadout currentScene={sceneIndex} />

      {/* ── Persistent foreground HUD, phase-driven. The whole layer fades
             out at the loop boundary and back in, so first/last frames match
             even though the phase state snaps 4 → 0. ── */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          duration: 4,
          times: [0, 0.08, 0.86, 1],
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <HudFrame phase={Math.max(0, sceneIndex)} />
      </motion.div>
    </div>
  );
}
