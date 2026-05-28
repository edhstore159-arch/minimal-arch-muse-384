import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../ClonedAuthContext';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import BottomNav from '../components/BottomNav';
import AuthModal from '../components/AuthModal';
import { Briefcase, Check, Sparkles, Star, Plus, MapPin, Image as ImageIcon, X, Crown, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CUSTOM_CATEGORY_VALUE, WORK_SERVICE_CATEGORIES } from '../lib/serviceCategories';

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80',
  'https://images.unsplash.com/photo-1573497491208-6b1acb260507?w=1200&q=80',
];

const CATEGORY_COLORS = ['from-orange-400 to-orange-600', 'from-rose-400 to-rose-600', 'from-yellow-400 to-yellow-600', 'from-cyan-400 to-cyan-600', 'from-amber-500 to-amber-700', 'from-stone-400 to-stone-600', 'from-blue-400 to-blue-600', 'from-green-400 to-green-600', 'from-red-400 to-red-600', 'from-slate-400 to-slate-600', 'from-emerald-400 to-emerald-600'];

const SERVICE_CATEGORIES = WORK_SERVICE_CATEGORIES.map((cat, index) => ({
  ...cat,
  color: CATEGORY_COLORS[index] || 'from-gray-400 to-gray-600',
}));

const normalizeCategorySlug = (slug) => {
  if (slug === 'reforma') return 'reformas';
  return SERVICE_CATEGORIES.some((cat) => cat.value === slug) ? slug : 'outros';
};

const PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    price: 'Grátis',
    sub: 'Para começar',
    color: 'from-gray-100 to-gray-200',
    badge: null,
    cta: 'Começar grátis',
    features: [
      'Perímetro de atuação',
      'Notificações de novas demandas',
      'Locação de material',
      'Amostra de prestação de serviço',
      '3 fotos das suas realizações',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'premier',
    name: 'Premier',
    price: 'R$ 29,90',
    sub: '/mês • 3 dias grátis • sem compromisso',
    color: 'from-orange-400 to-red-500',
    badge: 'Mais popular',
    cta: 'Começar 3 dias grátis',
    highlight: '🎁 3 dias grátis + 1 mês sem compromisso',
    features: [
      'Tudo do Standard',
      '✨ Receba ofertas de emprego ilimitadas',
      '✨ Publique pedidos de serviço ilimitados',
      'Telefone visível no perfil',
      '50 fotos das suas realizações',
      'Remover perfis similares',
      'Referenciamento prioritário no Google',
      'Acompanhamento personalizado',
      'Suporte por telefone',
    ],
  },
];

export default function OfferServicesPage() {
  const { token, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const [serviceOffer, setServiceOffer] = useState({
    title: '',
    description: '',
    price: '',
    categories: [],
    customCategory: '',
    location: null,
    images: [],
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleCategory = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleOfferCategory = (category) => {
    setServiceOffer((prev) => ({
      ...prev,
      categories: prev.categories.includes(category) ? [] : [category],
    }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5000000) {
      toast.error('Imagem muito grande! Máximo 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setServiceOffer((prev) => ({ ...prev, images: [...prev.images, reader.result] }));
      toast.success('Foto adicionada!');
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index) => {
    setServiceOffer((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const getLocation = () => {
    if (!navigator.geolocation) return;
    toast.info('Obtendo localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setServiceOffer((prev) => ({
          ...prev,
          location: { lat: pos.coords.latitude, lng: pos.coords.longitude, address: 'Localização atual' },
        }));
        toast.success('Localização adicionada!');
      },
      () => toast.error('Erro ao obter localização'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const submitOffer = async () => {
    if (!token || !user?.id) {
      setShowOfferModal(false);
      setAuthOpen(true);
      return;
    }
    if (!serviceOffer.title || !serviceOffer.description) {
      toast.error('Preencha título e descrição');
      return;
    }
    const selectedCategory = serviceOffer.categories[0];
    const customCategoryName = serviceOffer.customCategory?.trim();
    if (!selectedCategory) {
      toast.error('Selecione pelo menos uma categoria');
      return;
    }
    if (selectedCategory === CUSTOM_CATEGORY_VALUE && !customCategoryName) {
      toast.error('Escreva sua categoria');
      return;
    }
    try {
      // Upload base64 images to storage bucket
      const photoUrls = [];
      for (let i = 0; i < serviceOffer.images.length; i++) {
        const dataUrl = serviceOffer.images[i];
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
          if (typeof dataUrl === 'string') photoUrls.push(dataUrl);
          continue;
        }
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
        const path = `${user.id}/offer-${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from('svc-photos').upload(path, blob, {
          contentType: blob.type,
          upsert: false,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('svc-photos').getPublicUrl(path);
        photoUrls.push(pub.publicUrl);
      }

      let categorySlug = normalizeCategorySlug(selectedCategory);
      if (selectedCategory === CUSTOM_CATEGORY_VALUE) {
        const { data: createdSlug, error: categoryError } = await supabase.rpc('ensure_svc_category', {
          _name: customCategoryName,
        });
        if (categoryError) throw categoryError;
        categorySlug = createdSlug || 'outros';
      }

      const payload = {
        user_id: user.id,
        title: serviceOffer.title,
        description: serviceOffer.description + (serviceOffer.price ? `\n\nPreço: ${serviceOffer.price}` : ''),
        post_type: 'volunteer', // offer of service
        status: 'open',
        category_slug: categorySlug,
        photos: photoUrls,
        lat: serviceOffer.location?.lat ?? null,
        lng: serviceOffer.location?.lng ?? null,
        address: serviceOffer.location?.address ?? null,
        budget_range: serviceOffer.price || null,
      };

      const { error } = await supabase.from('svc_posts').insert(payload);
      if (error) throw error;

      toast.success('Serviço publicado!');
      setShowOfferModal(false);
      setServiceOffer({ title: '', description: '', price: '', categories: [], customCategory: '', location: null, images: [] });
      navigate('/home');
    } catch (e) {
      console.error('submitOffer error', e);
      toast.error(e?.message || 'Erro ao publicar');
    }
  };

  const handlePlanClick = (planId) => {
    if (planId === 'standard') {
      if (!token) setAuthOpen(true);
      else setShowOfferModal(true);
    } else {
      if (!token) setAuthOpen(true);
      else toast.info('Em breve: assinatura Premier');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-20" data-testid="offer-services-page">
      {/* Hero */}
      <div className="relative h-72 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
          style={{ backgroundImage: `url(${HERO_IMAGES[currentImageIndex]})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/80 via-orange-500/60 to-orange-600/90" />

        <div className="relative z-10 h-full flex flex-col justify-center px-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-8 h-8 text-yellow-200 animate-pulse" />
            <h1 className="text-3xl font-bold">Oferecer Serviços</h1>
          </div>
          <p className="text-white/90 text-lg">Transforme seu talento em renda</p>
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
              <Sparkles size={18} />
              <span className="text-sm font-medium">+1000 prestadores</span>
            </div>
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-4 py-2">
              <Star size={18} />
              <span className="text-sm font-medium">Visibilidade no bairro</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {HERO_IMAGES.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white w-6' : 'bg-white/50 w-2'}`}
            />
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-20">
        {/* Categorias */}
        <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            Quais serviços você oferece?
          </h2>
          <p className="text-sm text-gray-500 mb-4">Selecione uma ou mais categorias</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SERVICE_CATEGORIES.map((cat) => {
              const selected = selectedCategories.includes(cat.value);
              return (
                <button
                  key={cat.value}
                  onClick={() => toggleCategory(cat.value)}
                  className={`relative p-4 rounded-2xl border-2 transition-all text-left overflow-hidden ${
                    selected ? 'border-orange-500 shadow-lg scale-105' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {selected && <div className={`absolute inset-0 bg-gradient-to-br ${cat.color} opacity-20`} />}
                  <div className="relative z-10">
                    <div className="text-3xl mb-1">{cat.icon}</div>
                    <div className="font-medium text-sm text-gray-800">{cat.label}</div>
                    {selected && <Check size={16} className="absolute top-0 right-0 text-orange-500" />}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCategories.length > 0 && (
            <div className="mt-4 p-3 bg-orange-50 rounded-xl border border-orange-200 flex items-center gap-2">
              <Check size={16} className="text-orange-600" />
              <span className="text-sm text-orange-700 flex-1">
                {selectedCategories.length} categoria{selectedCategories.length > 1 ? 's' : ''} selecionada{selectedCategories.length > 1 ? 's' : ''}
              </span>
              <Button
                size="sm"
                onClick={() => (token ? setShowOfferModal(true) : setAuthOpen(true))}
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-full"
              >
                <Plus size={14} className="mr-1" /> Publicar
              </Button>
            </div>
          )}
        </div>

        {/* Planos */}
        <div className="bg-white rounded-3xl shadow-lg p-5 sm:p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Escolha seu plano</h2>
            <p className="text-gray-500">Comece grátis ou destaque-se com o Premier</p>
            <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-gradient-to-r from-orange-100 to-red-100 text-orange-700 text-xs font-semibold border border-orange-200">
              🎁 3 dias grátis no Premier — depois 1 mês sem compromisso, cancele quando quiser
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PLANS.map((plan) => {
              const isPremier = plan.id === 'premier';
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-6 border-2 transition-all hover:shadow-xl ${
                    isPremier ? 'border-orange-400 bg-gradient-to-br from-orange-50 to-red-50 shadow-lg scale-[1.02]' : 'border-gray-200 bg-white'
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-md">
                      <Crown size={12} /> {plan.badge}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    {isPremier ? (
                      <Crown className="w-6 h-6 text-orange-500" />
                    ) : (
                      <Star className="w-6 h-6 text-gray-500" />
                    )}
                    <h3 className={`text-2xl font-bold ${isPremier ? 'text-orange-600' : 'text-gray-900'}`}>{plan.name}</h3>
                  </div>
                  <div className="mb-3">
                    <span className={`text-3xl font-bold ${isPremier ? 'text-orange-600' : 'text-gray-900'}`}>{plan.price}</span>
                    <span className="text-sm text-gray-500 ml-1">{plan.sub}</span>
                  </div>
                  {plan.highlight && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-white/70 border border-orange-200 text-xs font-semibold text-orange-700 text-center">
                      {plan.highlight}
                    </div>
                  )}
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check size={16} className={`mt-0.5 flex-shrink-0 ${isPremier ? 'text-orange-500' : 'text-green-500'}`} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handlePlanClick(plan.id)}
                    className={`w-full rounded-full h-11 ${
                      isPremier
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md'
                        : 'bg-gray-900 hover:bg-gray-800 text-white'
                    }`}
                  >
                    {plan.cta}
                  </Button>
                  {isPremier && (
                    <p className="text-[11px] text-orange-700/80 mt-2 text-center">Sem cobrança nos primeiros 3 dias</p>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">* dentro do seu perímetro de atuação</p>
        </div>
      </div>

      {/* Modal de Publicação */}
      <Dialog open={showOfferModal} onOpenChange={setShowOfferModal}>
        <DialogContent className="rounded-3xl max-w-lg mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto bg-white p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
              <span>Publicar Serviço</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Apresente seu trabalho para quem está perto
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-3">
            <div>
              <Label className="text-sm font-bold mb-2 block">Título</Label>
              <Input
                placeholder="Ex: Pintor profissional"
                value={serviceOffer.title}
                onChange={(e) => setServiceOffer({ ...serviceOffer, title: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">Descrição</Label>
              <Textarea
                rows={3}
                placeholder="Conte sobre seu serviço, experiência, diferenciais..."
                value={serviceOffer.description}
                onChange={(e) => setServiceOffer({ ...serviceOffer, description: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">Preço (opcional)</Label>
              <Input
                placeholder="Ex: R$ 50/hora"
                value={serviceOffer.price}
                onChange={(e) => setServiceOffer({ ...serviceOffer, price: e.target.value })}
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-2xl">
              <Label className="text-sm font-bold mb-2 block">📂 Categorias</Label>
              <div className="grid grid-cols-4 gap-2">
                {SERVICE_CATEGORIES.map((cat) => {
                  const categoryValue = cat.value === 'outros' ? CUSTOM_CATEGORY_VALUE : cat.value;
                  const sel = serviceOffer.categories.includes(categoryValue);
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleOfferCategory(categoryValue)}
                      className={`p-2 rounded-xl border text-xs ${
                        sel ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="text-xl">{cat.icon}</div>
                      <div className="truncate">{cat.label}</div>
                    </button>
                  );
                })}
              </div>
              {serviceOffer.categories.includes(CUSTOM_CATEGORY_VALUE) && (
                <Input
                  value={serviceOffer.customCategory}
                  onChange={(e) => setServiceOffer({ ...serviceOffer, customCategory: e.target.value })}
                  placeholder="Escreva sua categoria. Ex: soldador, confeiteiro"
                  maxLength={40}
                  className="mt-3 rounded-xl bg-white"
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={getLocation} className="flex-1">
                <MapPin size={16} className="mr-1" />
                {serviceOffer.location ? 'Local OK' : 'Adicionar local'}
              </Button>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="flex-1">
                <ImageIcon size={16} className="mr-1" /> Foto
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileUpload} />
            </div>

            {serviceOffer.images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {serviceOffer.images.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={submitOffer}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full h-12"
            >
              Publicar Serviço
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} mode="signup" onModeChange={() => {}} />
      <BottomNav />
    </div>
  );
}
