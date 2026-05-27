import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ArrowLeft, MapPin, MessageCircle, Star } from 'lucide-react';

export default function PublicProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: pp }] = await Promise.all([
        supabase.from('svc_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('svc_posts').select('*').eq('user_id', userId).eq('status', 'open').order('created_at', { ascending: false }).limit(20),
      ]);
      setProfile(p);
      setPosts(pp || []);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>;
  if (!profile) return <div className="p-8 text-center text-gray-500">Perfil não encontrado.</div>;

  const initial = (profile.display_name || '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-700"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-semibold text-sm">Perfil</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-16 h-16">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg truncate">{profile.display_name}</h2>
              {profile.city && (
                <p className="text-xs text-gray-600 flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.city}</p>
              )}
              {Number(profile.rating) > 0 && (
                <p className="text-xs text-gray-600 flex items-center gap-1"><Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />{Number(profile.rating).toFixed(1)}</p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => navigate(`/servicos/chat?with=${userId}`)}
              className="bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4 mr-1" /> Mensagem
            </Button>
          </div>
          {profile.bio && <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{profile.bio}</p>}
          {profile.categories?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {profile.categories.map((c) => (
                <span key={c} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full capitalize">{c}</span>
              ))}
            </div>
          )}
        </Card>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Anúncios ({posts.length})</h3>
          {posts.length === 0 ? (
            <Card className="p-6 text-center text-sm text-gray-500">Nenhum anúncio publicado.</Card>
          ) : (
            <ul className="space-y-2">
              {posts.map((p) => (
                <Card key={p.id} className="p-3">
                  <p className="font-medium text-sm">{p.title}</p>
                  <p className="text-xs text-gray-600 line-clamp-2 mt-1">{p.description}</p>
                  {p.photos?.[0] && (
                    <img src={p.photos[0]} alt="" className="mt-2 w-full aspect-square object-cover rounded-md" />
                  )}
                </Card>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
