import React, { useRef, useState, useEffect } from 'react';
import { Plus, Radio, X, Video, VideoOff, Mic, MicOff, ImagePlus } from 'lucide-react';

const STORAGE_KEY = 'svc:stories:v1';

function loadStories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    const now = Date.now();
    // Stories expire after 24h, like Instagram
    return list.filter((s) => now - s.createdAt < 24 * 60 * 60 * 1000);
  } catch {
    return [];
  }
}

function saveStories(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

export default function ProfileStories({ avatarSrc, userName = 'Você' }) {
  const fileRef = useRef(null);
  const liveVideoRef = useRef(null);
  const liveStreamRef = useRef(null);
  const [stories, setStories] = useState(loadStories);
  const [viewing, setViewing] = useState(null);
  const [live, setLive] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [viewers, setViewers] = useState(0);

  useEffect(() => saveStories(stories), [stories]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setViewers((v) => v + Math.floor(Math.random() * 3)), 2500);
    return () => clearInterval(t);
  }, [live]);

  const onAddStory = () => fileRef.current?.click();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStories((prev) => [
        { id: Date.now(), createdAt: Date.now(), type: file.type.startsWith('video') ? 'video' : 'image', src: reader.result },
        ...prev,
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      liveStreamRef.current = stream;
      setLive(true);
      setViewers(1);
      setTimeout(() => {
        if (liveVideoRef.current) liveVideoRef.current.srcObject = stream;
      }, 50);
    } catch (err) {
      alert('Não foi possível acessar câmera/microfone: ' + err.message);
    }
  };

  const stopLive = () => {
    liveStreamRef.current?.getTracks().forEach((t) => t.stop());
    liveStreamRef.current = null;
    setLive(false);
    setViewers(0);
  };

  const toggleCam = () => {
    const track = liveStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled); }
  };
  const toggleMic = () => {
    const track = liveStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  return (
    <div className="px-6 sm:px-10 py-4 border-b border-gray-100">
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
        {/* Add story / your own */}
        <button
          onClick={onAddStory}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          title="Adicionar story"
        >
          <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="w-full h-full rounded-full bg-white p-[2px]">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-gray-500 text-xs">Eu</span>
                )}
              </div>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full border-2 border-white flex items-center justify-center">
              <Plus size={12} className="text-white" />
            </div>
          </div>
          <span className="text-xs text-textPrimary truncate max-w-[64px]">Seu story</span>
        </button>

        {/* Go live */}
        <button
          onClick={live ? stopLive : startLive}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          title={live ? 'Encerrar transmissão' : 'Iniciar transmissão ao vivo'}
        >
          <div className={`relative w-16 h-16 rounded-full p-[2px] ${live ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-tr from-red-500 to-pink-500'}`}>
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <Radio size={26} className={live ? 'text-red-500' : 'text-red-500'} />
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded uppercase">
              {live ? 'AO VIVO' : 'Live'}
            </span>
          </div>
          <span className="text-xs text-textPrimary">{live ? 'Encerrar' : 'Ao vivo'}</span>
        </button>

        {/* Existing stories */}
        {stories.map((s) => (
          <button
            key={s.id}
            onClick={() => setViewing(s)}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
              <div className="w-full h-full rounded-full bg-white p-[2px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-200">
                  {s.type === 'video' ? (
                    <video src={s.src} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={s.src} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              </div>
            </div>
            <span className="text-xs text-textPrimary">{userName}</span>
          </button>
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />

      {/* Story viewer */}
      {viewing && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => setViewing(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setViewing(null)}>
            <X size={28} />
          </button>
          {viewing.type === 'video' ? (
            <video src={viewing.src} autoPlay controls className="max-h-full max-w-full" />
          ) : (
            <img src={viewing.src} alt="" className="max-h-full max-w-full" />
          )}
        </div>
      )}

      {/* Live overlay */}
      {live && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 text-white">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-red-500 text-xs font-bold rounded uppercase animate-pulse">● AO VIVO</span>
              <span className="text-sm opacity-80">{viewers} espectadores</span>
            </div>
            <button onClick={stopLive} className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-full font-semibold">
              Encerrar
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <video ref={liveVideoRef} autoPlay muted playsInline className="max-h-full max-w-full" />
          </div>
          <div className="flex items-center justify-center gap-4 p-6">
            <button onClick={toggleMic} className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center">
              {micOn ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button onClick={toggleCam} className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center">
              {camOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
