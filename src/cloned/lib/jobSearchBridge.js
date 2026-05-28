import { prettifyCategoryLabel } from './serviceCategories';

export const JOB_PLATFORMS = [
  { id: 'indeed', name: 'Indeed Brasil', logo: '🔵', color: 'bg-blue-600', baseUrl: 'https://br.indeed.com/jobs', description: 'Maior site de empregos do mundo' },
  { id: 'linkedin', name: 'LinkedIn', logo: '💼', color: 'bg-blue-700', baseUrl: 'https://www.linkedin.com/jobs/search', description: 'Rede profissional mundial' },
  { id: 'catho', name: 'Catho', logo: '🟢', color: 'bg-green-600', baseUrl: 'https://www.catho.com.br/vagas', description: 'Vagas de emprego no Brasil' },
  { id: 'vagas', name: 'Vagas.com', logo: '🟡', color: 'bg-yellow-500', baseUrl: 'https://www.vagas.com.br/vagas-de', description: 'Portal brasileiro de vagas' },
  { id: 'infojobs', name: 'InfoJobs', logo: '🟠', color: 'bg-orange-500', baseUrl: 'https://www.infojobs.com.br/empregos.aspx', description: 'Empregos em todo Brasil' },
  { id: 'gupy', name: 'Gupy', logo: '🟣', color: 'bg-orange-600', baseUrl: 'https://portal.gupy.io/job-search', description: 'Vagas em empresas brasileiras' },
  { id: 'sine', name: 'SINE', logo: '🇧🇷', color: 'bg-emerald-700', baseUrl: 'https://servicos.mte.gov.br/sine', description: 'Sistema Nacional de Emprego' },
  { id: 'glassdoor', name: 'Glassdoor', logo: '🟩', color: 'bg-green-700', baseUrl: 'https://www.glassdoor.com.br/Vaga/index.htm', description: 'Vagas e avaliações de empresas' },
];

export const SEARCH_SUGGESTIONS = {
  reformas: ['reformas', 'manutenção residencial', 'faz tudo', 'reparos'],
  pintura: ['pintor', 'pintura residencial', 'pintura de parede'],
  eletrica: ['eletricista', 'instalação elétrica', 'manutenção elétrica'],
  hidraulica: ['encanador', 'bombeiro hidráulico', 'vazamento'],
  marcenaria: ['marceneiro', 'carpinteiro', 'móveis planejados'],
  pedreiro: ['pedreiro', 'construção civil', 'alvenaria'],
  limpeza: ['auxiliar de limpeza', 'faxineira', 'diarista'],
  jardinagem: ['jardineiro', 'paisagista', 'poda de jardim'],
  transporte: ['motorista', 'entregador', 'frete', 'mudança'],
  mecanica: ['mecânico', 'mecânico de autos', 'manutenção automotiva'],
  outros: ['serviços gerais', 'ajudante', 'profissional autônomo'],
};

export const normalizeSearchText = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const getPrimarySearchTerm = (category) => SEARCH_SUGGESTIONS[category]?.[0] || prettifyCategoryLabel(category || '').toLowerCase() || 'emprego';

export const generateJobSearchUrl = (platform, query, location) => {
  const searchTerm = query || 'emprego';
  const loc = location || 'Brasil';
  const slug = (s) => encodeURIComponent(String(s).toLowerCase().trim().replace(/\s+/g, '-'));

  switch (platform.id) {
    case 'indeed':
      return `${platform.baseUrl}?q=${encodeURIComponent(searchTerm)}&l=${encodeURIComponent(loc)}`;
    case 'linkedin':
      return `${platform.baseUrl}?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(`${loc}, Brasil`)}&f_TPR=r86400`;
    case 'catho':
      return `https://www.catho.com.br/vagas/${slug(searchTerm)}/${slug(loc)}/`;
    case 'vagas':
      return `https://www.vagas.com.br/vagas-de-${slug(searchTerm)}?l[]=${encodeURIComponent(loc)}`;
    case 'infojobs':
      return `${platform.baseUrl}?palabra=${encodeURIComponent(searchTerm)}&provincia=${encodeURIComponent(loc)}`;
    case 'gupy':
      return `${platform.baseUrl}?jobName=${encodeURIComponent(searchTerm)}&city=${encodeURIComponent(loc)}`;
    case 'glassdoor':
      return `https://www.glassdoor.com.br/Vaga/${slug(loc)}-${slug(searchTerm)}-vagas-SRCH_IL.0,${loc.length}_IC2487341_KO${loc.length + 1},${loc.length + 1 + searchTerm.length}.htm`;
    case 'sine':
      return `https://www.google.com/search?q=${encodeURIComponent(`SINE vagas ${searchTerm} ${loc}`)}`;
    default:
      return platform.baseUrl;
  }
};

export const createPlatformSearchJobs = (query, location, prefix = 'platform') => {
  const q = (query || 'emprego').trim();
  const loc = (location || 'Brasil').trim();
  return JOB_PLATFORMS.map((platform) => ({
    id: `${prefix}-${platform.id}-${q}-${loc}`,
    title: `${q} em ${loc}`,
    company: platform.name,
    company_logo: null,
    location: loc,
    url: generateJobSearchUrl(platform, q, loc),
    description: `Abrir busca de ${q} em ${loc} diretamente no ${platform.name}.`,
    salary: null,
    category: 'Busca direta',
    publication_date: new Date().toISOString(),
    source: platform.name,
    isPlatformSearch: true,
  }));
};

const storageKey = (userId) => `svc:last-job-search:${userId || 'anon'}`;

export const saveLastJobSearch = ({ userId, query, location, category, jobs }) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({
      query,
      location,
      category,
      jobs: (jobs || []).slice(0, 12),
      savedAt: Date.now(),
    }));
  } catch {}
};

export const readLastJobSearch = (userId) => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
  } catch {
    return null;
  }
};