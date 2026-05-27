import React, { useRef, useState, useEffect } from 'react';
import { Film } from 'lucide-react';

/**
 * Robust video player with autoplay-on-visible.
 * - Muted + playsInline to satisfy browser autoplay policies
 * - Plays when scrolled into view, pauses when out of view
 */
export default function VideoPlayer({ src, className = '', testid }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(false);

  let mimeType = 'video/mp4';
  if (typeof src === 'string' && src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);/);
    if (match) mimeType = match[1];
  }

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Try immediate autoplay (muted is allowed by browsers)
    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    if (typeof IntersectionObserver === 'undefined') {
      tryPlay();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            tryPlay();
          } else {
            try { el.pause(); } catch (_) {}
          }
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-100 rounded-md p-6 ${className}`} data-testid={`${testid}-error`}>
        <Film className="w-10 h-10 text-gray-400 mb-2" />
        <p className="text-xs text-gray-600 text-center">
          Vídeo em formato não suportado pelo navegador.
          <br />
          <span className="text-gray-400">(Tente reenviar como MP4)</span>
        </p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      data-testid={testid}
      className={`w-full max-h-[600px] rounded-md border border-gray-200 bg-black object-cover ${className}`}
      controls
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      onError={() => setError(true)}
    >
      <source src={src} type={mimeType} />
      {mimeType !== 'video/mp4' && <source src={src} type="video/mp4" />}
      Seu navegador não suporta a tag video.
    </video>
  );
}
