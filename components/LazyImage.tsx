import React, { useEffect, useRef, useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  placeholder?: string;
  className?: string;
  imgClassName?: string;
}

const LazyImage: React.FC<LazyImageProps> = ({ src, alt, placeholder, className, imgClassName }) => {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className || ''}>
      {!inView || !loaded ? (
        <div className={`w-full h-full flex items-center justify-center ${imgClassName || ''}`}>
          {placeholder ? (
            <img src={placeholder} alt="" className="w-full h-full object-cover opacity-30" />
          ) : (
            <div className="w-full h-full bg-slate-200 animate-pulse" />
          )}
        </div>
      ) : null}
      {inView && (
        <img
          src={src}
          alt={alt}
          className={`${imgClassName || ''} ${!loaded ? 'hidden' : ''}`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}
    </div>
  );
};

export default LazyImage;