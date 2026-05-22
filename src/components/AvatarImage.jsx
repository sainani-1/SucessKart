import React, { useMemo, useState, useEffect } from 'react';
import {
  FALLBACK_AVATAR,
  buildAvatarPublicUrl,
  isDefaultAvatarUrl,
  normalizeAvatarUrl
} from '../utils/avatarUtils';

const AvatarImage = ({ userId, avatarUrl, alt = 'Avatar', className = '', fallbackName = 'User' }) => {
  const [index, setIndex] = useState(0);

  const candidates = useMemo(() => {
    const urls = [];
    const add = (u) => {
      if (u && !urls.includes(u)) urls.push(u);
    };

    if (avatarUrl && !isDefaultAvatarUrl(avatarUrl)) {
      add(normalizeAvatarUrl(avatarUrl));
    }

    if (userId) {
      ['jpg', 'jpeg', 'png', 'webp'].forEach((ext) => {
        add(buildAvatarPublicUrl(`${userId}.${ext}`));
        add(buildAvatarPublicUrl(`avatars/${userId}.${ext}`));
      });
    }

    const initialsFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || 'User')}&background=e2e8f0&color=334155&bold=true&size=200`;
    add(initialsFallback);
    add(FALLBACK_AVATAR);
    return urls;
  }, [userId, avatarUrl, fallbackName]);

  useEffect(() => {
    setIndex(0);
  }, [candidates.length, userId, avatarUrl]);

  return (
    <img
      src={candidates[index] || FALLBACK_AVATAR}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      fetchpriority="high"
      onError={() => {
        setIndex((i) => (i < candidates.length - 1 ? i + 1 : i));
      }}
    />
  );
};

export default AvatarImage;
