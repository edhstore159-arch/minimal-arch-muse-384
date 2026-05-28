import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import AuthModal from '../components/AuthModal';

const features = [
  {
    section: 'Oferecer meus serviços',
    rows: [
      { group: 'Configuração', items: [
        { label: 'Perímetro de atuação', standard: true, premier: true },
        { label: 'Notificações "Novas demandas"', standard: true, premier: true },
      ]},
      { group: 'Responder a demandas', items: [
        { label: 'Locação de material', standard: true, premier: true },
        { label: 'Prestação de serviço', standard: 'Amostra', premier: 'Ilimitado*' },
      ]},
    ],
  },
  {
    section: 'Minha visibilidade',
    rows: [
      { group: 'Exibição no meu perfil', items: [
        { label: 'Número de telefone', standard: false, premier: true },
        { label: 'Fotos das minhas realizações', standard: '3', premier: '50' },
        { label: 'Remover perfis similares', standard: false, premier: true },
      ]},
      { group: 'Referenciamento no Google', items: [
        { label: 'Referenciamento prioritário no Google', standard: false, premier: true },
      ]},
    ],
  },
  {
    section: 'Assistência',
    rows: [
      { group: '', items: [
        { label: 'Acompanhamento personalizado e prioritário', standard: false, premier: true },
        { label: 'Suporte por e-mail', standard: true, premier: true },
        { label: 'Suporte por telefone', standard: false, premier: true },
      ]},
    ],
  },
];

function Cell({ value }) {
  if (value === true) return <Check className="w-5 h-5 text-green-500 mx-auto" />;
  if (value === false) return <X className="w-5 h-5 text-red-400 mx-auto" />;
  return <span className="text-sm font-medium text-gray-800">{value}</span>;
}

export default function OfferServicesPage() {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-700 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" /> Voltar
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-orange-400 rounded-lg flex items-center justify-center text-white font-bold">W</div>
            <span className="text-lg font-bold">
              <span className="text-green-500">PertoDeMim</span><span className="text-orange-500">Servicos</span>
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Assinatura</h1>
          <p className="text-gray-600">Compare os diferentes planos</p>
        </div>

        {/* Plans header */}
        <div className="grid grid-cols-3 border border-gray-200 rounded-2xl overflow-hidden">
          <div className="bg-gray-50 p-6 hidden sm:block" />
          <div className="p-6 text-center border-l border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Standard</h2>
            <p className="text-gray-700 mt-2">Grátis</p>
            <Button onClick={() => setAuthOpen(true)} className="mt-4 bg-gray-900 hover:bg-gray-800 text-white rounded-full px-8">
              Começar
            </Button>
          </div>
          <div className="p-6 text-center border-l border-gray-200 bg-orange-50/40">
            <h2 className="text-2xl font-bold text-orange-500">Premier</h2>
            <p className="text-orange-600 font-medium mt-2">A partir de R$ 29,90/mês</p>
            <p className="text-xs text-gray-500">Sem compromisso</p>
            <Button onClick={() => setAuthOpen(true)} className="mt-4 bg-orange-400 hover:bg-orange-500 text-white rounded-full px-8">
              Assinar
            </Button>
          </div>
        </div>

        {/* Features table */}
        <div className="mt-8 border border-gray-200 rounded-2xl overflow-hidden">
          {features.map((section, si) => (
            <div key={si} className={si > 0 ? 'border-t border-gray-200' : ''}>
              <div className="px-6 py-4 bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900">{section.section}</h3>
              </div>
              {section.rows.map((group, gi) => (
                <div key={gi}>
                  {group.group && (
                    <div className="px-6 pt-4 pb-2 text-sm font-semibold text-gray-700">{group.group}</div>
                  )}
                  {group.items.map((item, ii) => (
                    <div key={ii} className="grid grid-cols-3 px-6 py-3 border-t border-gray-100 items-center">
                      <div className="text-sm text-gray-700 col-span-1">{item.label}</div>
                      <div className="text-center"><Cell value={item.standard} /></div>
                      <div className="text-center bg-orange-50/30"><Cell value={item.premier} /></div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-4">* dentro do seu perímetro de atuação</p>

        <div className="mt-10 flex justify-center">
          <Button onClick={() => setAuthOpen(true)} className="bg-orange-400 hover:bg-orange-500 text-white rounded-full h-12 px-10 text-base">
            Criar conta e oferecer serviços
          </Button>
        </div>
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} mode="signup" onModeChange={() => {}} />
    </div>
  );
}
