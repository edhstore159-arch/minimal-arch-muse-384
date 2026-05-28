import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import BottomNav from '../components/BottomNav';
import { Search, MapPin, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const normalizeText = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function ServicesPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([{ value: 'all', label: 'Todas' }]);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: cats }, { data: svc, error }] = await Promise.all([
        supabase.from('svc_categories').select('slug, name').order('sort_order'),
        supabase.from('svc_posts').select('*').eq('status', 'open').eq('post_type', 'volunteer').order('created_at', { ascending: false }).limit(500),
      ]);
      if (error) console.warn('svc_posts fetch error', error);
      setCategories([
        { value: 'all', label: 'Todas' },
        ...((cats ?? []).map((c) => ({ value: c.slug, label: c.name }))),
      ]);
      setPosts(svc ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = normalizeText(searchTerm.trim());
    return posts.filter((p) => {
      if (category !== 'all' && (p.category_slug || 'outros') !== category) return false;
      if (!term) return true;
      const label = categoryLabel(p.category_slug || 'outros');
      const searchable = normalizeText(`${p.title || ''} ${p.description || ''} ${p.address || ''} ${p.budget_range || ''} ${p.category_slug || ''} ${label}`);
      return (
        searchable.includes(term)
      );
    });
  }, [posts, searchTerm, category, categories]);

  const categoryLabel = (slug) => categories.find((c) => c.value === slug)?.label || slug;

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="services-page">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 space-y-4">
          <h1 className="text-2xl font-heading font-bold">Buscar Serviços</h1>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                data-testid="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar serviços..."
                className="pl-10 rounded-xl"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="category-filter" className="w-40 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Carregando serviços...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500" data-testid="no-services-message">
            Nenhum serviço encontrado
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate('/home')}
                data-testid="service-card"
                className="text-left bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="text-base font-bold flex-1 line-clamp-2">{p.title}</h3>
                  <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 whitespace-nowrap">
                    {categoryLabel(p.category_slug || 'outros')}
                  </span>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-3">{p.description}</p>
                )}
                <div className="space-y-1 text-xs text-gray-500">
                  {p.address && (
                    <div className="flex items-start gap-1.5">
                      <MapPin size={14} className="flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{p.address}</span>
                    </div>
                  )}
                  {p.budget_range && (
                    <div className="flex items-center gap-1.5">
                      <Tag size={14} />
                      <span>{p.budget_range}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
