import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { VIDEO_BUFFER_PILL_MS } from '../../lib/constants';

export const PostVideoPlayer = forwardRef(function PostVideoPlayer(
  {
    poster,
    src,
    className,
    style,
    showControls,
    muted,
    onTap,
  }: {
    poster?: string;
    src: string;
    className?: string;
    style?: React.CSSProperties;
    showControls?: boolean;
    muted?: boolean;
    onTap?: () => void;
  },
  ref: React.Ref<HTMLVideoElement>
) {
  const [buffering, setBuffering] = useState(false);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBufferTimer = useCallback(() => {
    if (bufferTimer.current) {
      clearTimeout(bufferTimer.current);
      bufferTimer.current = null;
    }
  }, []);

  const markBuffering = useCallback(() => {
    clearBufferTimer();
    bufferTimer.current = setTimeout(() => setBuffering(true), VIDEO_BUFFER_PILL_MS);
  }, [clearBufferTimer]);

  const markReady = useCallback(() => {
    clearBufferTimer();
    setBuffering(false);
  }, [clearBufferTimer]);

  useEffect(() => () => clearBufferTimer(), [clearBufferTimer]);

  return (
    <div className="relative flex items-center justify-center max-w-full max-h-full">
      <video
        ref={ref}
        src={src}
        poster={poster}
        controls={showControls}
        muted={muted}
        autoPlay
        loop
        playsInline
        preload="auto"
        onWaiting={markBuffering}
        onPlaying={markReady}
        onCanPlay={markReady}
        onLoadedData={markReady}
        onClick={(e) => {
          e.stopPropagation();
          onTap?.();
        }}
        className={className}
        style={style}
      />
      {buffering && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 border border-white/10 pointer-events-none backdrop-blur-sm">
          <div className="w-3 h-3 border-2 border-theme-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">Loading</span>
        </div>
      )}
    </div>
  );
});
