import React, { useContext, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../ClonedAuthContext';
import { X } from 'lucide-react';

/**
 * CallPage — embeds Jitsi Meet directly in an iframe with the current
 * user's display name and email prefilled, so the call starts without
 * any prejoin screen or manual data entry.
 */
export default function CallPage() {
  const { room } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext) || {};

  const kind = params.get('kind') || 'video';
  const startVideoMuted = kind === 'audio';

  const src = useMemo(() => {
    const displayName = user?.display_name || user?.name || user?.email?.split('@')[0] || 'Convidado';
    const email = user?.email || '';
    const avatar = user?.avatar_url || '';

    const hash = new URLSearchParams();
    hash.set('userInfo.displayName', `"${displayName}"`);
    if (email) hash.set('userInfo.email', `"${email}"`);
    if (avatar) hash.set('config.localAvatarUrl', `"${avatar}"`);
    hash.set('config.prejoinPageEnabled', 'false');
    hash.set('config.prejoinConfig.enabled', 'false');
    hash.set('config.requireDisplayName', 'false');
    hash.set('config.startWithAudioMuted', 'false');
    hash.set('config.startWithVideoMuted', String(startVideoMuted));
    hash.set('config.disableDeepLinking', 'true');
    hash.set('interfaceConfig.MOBILE_APP_PROMO', 'false');

    return `https://meet.jit.si/${encodeURIComponent(room)}#${hash.toString()}`;
  }, [room, user, startVideoMuted]);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <button
        onClick={() => navigate(-1)}
        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white grid place-items-center"
        title="Encerrar"
        aria-label="Encerrar chamada"
      >
        <X className="w-5 h-5" />
      </button>
      <iframe
        title="Chamada"
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        className="w-full h-full border-0"
      />
    </div>
  );
}
