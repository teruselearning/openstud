import React, { useEffect, useRef, useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  placeholder?: string;
  className?: string;
  imgClassName?: string;
}

/**
 * Image that shows a placeholder until the real image has loaded.
 *
 * IMPORTANT: the <img> must stay in layout while loading (we fade it with opacity, never
 * `display:none` / `hidden`). Browsers only start a `loading="lazy"` image once it has a box
 * near the viewport, so a display:none lazy image never loads — the placeholder would stay
 * forever.
 */
const LazyImage: React.FC<LazyImageProps> = ({ src, alt, placeholder, className, imgClassName }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // New src (e.g. the real image arrives after the fallback): reset, and pick up images that
  // are already decoded from cache.
  useEffect(() => {
    setFailed(false);
    const el = imgRef.current;
    setLoaded(!!el && el.complete && el.naturalWidth > 0);
  }, [src]);

  const showPlaceholder = !loaded || failed;

  return (
    <div className={`relative ${className || ''}`}>
      {showPlaceholder && (
        <div className={`absolute inset-0 w-full h-full flex items-center justify-center ${imgClassName || ''}`}>
          {placeholder ? (
            <img src={placeholder} alt="" className="w-full h-full object-cover opacity-30" />
          ) : (
            <div className="w-full h-full bg-slate-200 animate-pulse" />
          )}
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`${imgClassName || ''} ${showPlaceholder ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => { setFailed(false); setLoaded(true); }}
        onError={() => { setFailed(true); setLoaded(true); }}
      />
    </div>
  );
};

export default LazyImage;
