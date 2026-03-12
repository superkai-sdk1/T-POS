import { useMemo } from 'react';

function getAvatarHue(seed: string): number {
  if (!seed) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

interface ClientAvatarProps {
  photoUrl?: string | null;
  id?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  rounded?: 'full' | 'xl';
  className?: string;
}

const sizeMap = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-11 h-11', xl: 'w-12 h-12', '2xl': 'w-16 h-16' };

export function ClientAvatar({ photoUrl, id = '', size = 'md', rounded = 'full', className = '' }: ClientAvatarProps) {
  const hue = useMemo(() => getAvatarHue(id), [id]);
  const sizeClass = sizeMap[size];
  const roundedClass = rounded === 'xl' ? 'rounded-xl' : 'rounded-full';

  return (
    <div
      className={`${roundedClass} overflow-hidden shrink-0 bg-[var(--c-surface-hover)] flex items-center justify-center ${sizeClass} ${className}`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <img
          src="/icons/client.svg"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: `hue-rotate(${hue}deg) saturate(0.7) brightness(1.25)` }}
        />
      )}
    </div>
  );
}
