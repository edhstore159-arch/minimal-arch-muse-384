import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../ClonedAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import BottomNav from '../components/BottomNav';
import {
  Users, FileText, BarChart3, Shield, Home, ChevronRight,
  CreditCard, Megaphone, Trash2, Check, X, Search, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const [profiles, setProfiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [subs, setSubs] = useState([]);
  const [stats, setStats] = useState({
    users: 0, posts: 0, services: 0, helpRequests: 0,
    subsActive: 0, subsTrial: 0, subsExpired: 0, subsPending: 0,
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, po, su] = await Promise.all([
        supabase.from('svc_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('svc_posts').select('*').order('created_at', { ascending: false }),
        supabase.from('svc_subscriptions').select('*').order('created_at', { ascending: false }),
      ]);
      const profs = p.data ?? [];
      const pos = po.data ?? [];
      const sub = su.data ?? [];

      // map user_id -> profile for display
      const profMap = Object.fromEntries(profs.map((x) => [x.user_id, x]));
      const posWithProfile = pos.map((x) => ({ ...x, _profile: profMap[x.user_id] }));
      const subWithProfile = sub.map((x) => ({ ...x, _profile: profMap[x.user_id] }));

      setProfiles(profs);
      setPosts(posWithProfile);
      setSubs(subWithProfile);

      const now = Date.now();
      setStats({
        users: profs.length,
        posts: pos.length,
        services: pos.filter((x) => x.post_type === 'volunteer').length,
        helpRequests: pos.filter((x) => x.post_type !== 'volunteer').length,
        subsActive: sub.filter((s) => s.status === 'active' && (!s.expires_at || new Date(s.expires_at).getTime() > now)).length,
        subsTrial: sub.filter((s) => s.status === 'trial').length,
        subsExpired: sub.filter((s) => s.status === 'expired' || (s.expires_at && new Date(s.expires_at).getTime() <= now && s.status === 'active')).length,
        subsPending: sub.filter((s) => s.status === 'pix').length,
      });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const deletePost = async (id) => {
    if (!confirm('Excluir esta publicação?')) return;
    const { error } = await supabase.from('svc_posts').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Publicação removida'); loadAll(); }
  };

  const setSubStatus = async (id, status) => {
    const patch = { status };
    if (status === 'active') patch.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('svc_subscriptions').update(patch).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success(`Assinatura ${status === 'active' ? 'ativada' : 'expirada'}`); loadAll(); }
  };

  const filteredProfiles = profiles.filter((u) =>
    !searchTerm || (u.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) || u.city?.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const filteredPosts = posts.filter((p) =>
    !searchTerm || p.title?.toLowerCase().includes(searchTerm.toLowerCase()) || p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSubBadge = (s) => {
    const now = Date.now();
    const isExpired = s.expires_at && new Date(s.expires_at).getTime() <= now;
    if (s.status === 'active' && !isExpired) return 'bg-green-100 text-green-700';
    if (s.status === 'trial') return 'bg-blue-100 text-blue-700';
    if (s.status === 'pix') return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
    { id: 'users', label: 'Usuários', icon: Users },
    { id: 'posts', label: 'Publicações', icon: FileText },
    { id: 'ads', label: 'Serviços/Ads', icon: Megaphone },
    { id: 'subs', label: 'Assinaturas', icon: CreditCard },
  ];

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-24" data-testid="admin-dashboard">
      <div className="bg-gradient-to-r from-primary to-secondary text-white py-6 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
            <Home size={16} /><ChevronRight size={14} /><span>Administração</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Shield size={32} /> Painel Administrativo
          </h1>
          <p className="text-white/80 mt-1">Olá, {user?.name || user?.email}. Gerencie todo o sistema.</p>
        </div>
      </div>

      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="flex gap-1 overflow-x-auto py-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium whitespace-nowrap ${
                    activeTab === t.id ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  <Icon size={18} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card icon={Users} label="Usuários" value={stats.users} color="blue" />
            <Card icon={FileText} label="Publicações" value={stats.posts} color="purple" />
            <Card icon={Megaphone} label="Serviços / Ads" value={stats.services} color="orange" />
            <Card icon={FileText} label="Pedidos de ajuda" value={stats.helpRequests} color="pink" />
            <Card icon={CreditCard} label="Assinaturas ativas" value={stats.subsActive} color="green" />
            <Card icon={CreditCard} label="Trial" value={stats.subsTrial} color="blue" />
            <Card icon={CreditCard} label="PIX pendente" value={stats.subsPending} color="yellow" />
            <Card icon={CreditCard} label="Vencidas" value={stats.subsExpired} color="red" />
          </div>
        )}

        {(activeTab === 'users' || activeTab === 'posts' || activeTab === 'ads') && (
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input className="pl-10" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl shadow-sm divide-y">
            {filteredProfiles.length === 0 && <p className="p-6 text-center text-gray-500">Nenhum usuário.</p>}
            {filteredProfiles.map((u) => (
              <div key={u.id} className="p-4 flex items-center gap-3">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">{u.display_name?.[0]?.toUpperCase()}</div>}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.display_name}</p>
                  <p className="text-xs text-gray-500 truncate">{u.role} · {u.city || 'sem cidade'} · {new Date(u.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100">{u.role}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="bg-white rounded-2xl shadow-sm divide-y">
            {filteredPosts.filter((p) => p.post_type !== 'volunteer').length === 0 && <p className="p-6 text-center text-gray-500">Nenhuma publicação.</p>}
            {filteredPosts.filter((p) => p.post_type !== 'volunteer').map((p) => (
              <PostRow key={p.id} p={p} onDelete={deletePost} />
            ))}
          </div>
        )}

        {activeTab === 'ads' && (
          <div className="bg-white rounded-2xl shadow-sm divide-y">
            {filteredPosts.filter((p) => p.post_type === 'volunteer').length === 0 && <p className="p-6 text-center text-gray-500">Nenhum anúncio de serviço.</p>}
            {filteredPosts.filter((p) => p.post_type === 'volunteer').map((p) => (
              <PostRow key={p.id} p={p} onDelete={deletePost} />
            ))}
          </div>
        )}

        {activeTab === 'subs' && (
          <div className="bg-white rounded-2xl shadow-sm divide-y">
            {subs.length === 0 && <p className="p-6 text-center text-gray-500">Nenhuma assinatura.</p>}
            {subs.map((s) => (
              <div key={s.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium">{s._profile?.display_name || s.user_id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">
                    R$ {Number(s.amount_brl).toFixed(2)} · {s.pix_txid || 'sem txid'} · criada {new Date(s.created_at).toLocaleDateString('pt-BR')}
                    {s.expires_at && ` · vence ${new Date(s.expires_at).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getSubBadge(s)}`}>{s.status}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setSubStatus(s.id, 'active')} className="bg-green-600 hover:bg-green-700">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSubStatus(s.id, 'expired')}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function Card({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600', green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600', purple: 'bg-purple-100 text-purple-600',
    pink: 'bg-pink-100 text-pink-600', red: 'bg-red-100 text-red-600',
    yellow: 'bg-yellow-100 text-yellow-600',
  };
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function PostRow({ p, onDelete }) {
  return (
    <div className="p-4 flex items-start gap-3">
      {p.photos?.[0] && <img src={p.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover" />}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{p.title}</p>
        <p className="text-xs text-gray-500 truncate">{p._profile?.display_name || 'usuário'} · {p.category_slug || 'sem categoria'} · {new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.description}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onDelete(p.id)}>
        <Trash2 className="w-4 h-4 text-red-600" />
      </Button>
    </div>
  );
}
