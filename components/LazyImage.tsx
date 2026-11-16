import React, { useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  placeholder?: string;
  className?: string;
  imgClassName?: string;
}

const LazyImage: React.FC<LazyImageProps> = ({ src, alt, placeholder, className, imgClassName }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={className || ''}>
      {!loaded && (
        <div className={`w-full h-full flex items-center justify-center ${imgClassName || ''}`}>
          {placeholder ? (
            <img src={placeholder} alt="" className="w-full h-full object-cover opacity-30" />
          ) : (
            <div className="w-full h-full bg-slate-200 animate-pulse" />
          )}
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`${imgClassName || ''} ${!loaded ? 'hidden' : ''}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
};

export default LazyImage;