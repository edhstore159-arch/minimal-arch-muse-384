import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from '../ClonedAuthContext';
import { Phone, PhoneOff, Video } from 'lucide-react';

/**
 * Listens for incoming calls (rows in `calls` table) targeting current user
 * and shows a fixed red ringing banner with Accept / Decline actions.
 */
export default function IncomingCallListener() {
  const { user } = useContext(AuthContext) || {};
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('incoming-calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          if (payload?.new?.status === 'ringing') setIncoming(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          if (payload?.new?.status !== 'ringing') setIncoming(null);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  if (!incoming) return null;

  const accept = async () => {
    try {
      await supabase.from('calls').update({ status: 'accepted' }).eq('id', incoming.id);
      navigate(`/call/${incoming.room}?kind=${incoming.kind || 'video'}`);
    } catch (e) { console.error('[call] accept failed', e); }
    setIncoming(null);
  };

  const decline = async () => {
    try {
      await supabase.from('calls').update({ status: 'declined' }).eq('id', incoming.id);
    } catch (e) { console.error('[call] decline failed', e); }
    setIncoming(null);
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-sm rounded-2xl bg-red-600 text-white shadow-2xl border-2 border-red-700 animate-pulse">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-white/20 grid place-items-center shrink-0">
          {incoming.kind === 'audio' ? <Phone className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide opacity-90">
            {incoming.kind === 'audio' ? 'Chamada de voz' : 'Chamada de vídeo'} recebida
          </p>
          <p className="font-semibold truncate">{incoming.caller_name || 'Alguém'} está ligando…</p>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={decline}
          className="flex-1 bg-white/15 hover:bg-white/25 rounded-full py-2 text-sm font-medium flex items-center justify-center gap-1.5"
        >
          <PhoneOff className="w-4 h-4" /> Recusar
        </button>
        <button
          onClick={accept}
          className="flex-1 bg-green-500 hover:bg-green-600 rounded-full py-2 text-sm font-medium flex items-center justify-center gap-1.5"
        >
          <Phone className="w-4 h-4" /> Atender
        </button>
      </div>
    </div>
  );
}
