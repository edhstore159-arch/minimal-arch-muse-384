export const WORK_SERVICE_CATEGORIES = [
  { value: 'reformas', label: 'Reformas', icon: '🔨', desc: 'Reparos, manutenção e pequenas obras' },
  { value: 'pintura', label: 'Pintura', icon: '🎨', desc: 'Paredes, fachadas e acabamentos' },
  { value: 'eletrica', label: 'Elétrica', icon: '💡', desc: 'Instalações, tomadas e manutenção' },
  { value: 'hidraulica', label: 'Hidráulica', icon: '🚰', desc: 'Encanamento, vazamentos e reparos' },
  { value: 'marcenaria', label: 'Marcenaria', icon: '🪚', desc: 'Móveis, portas e madeira' },
  { value: 'pedreiro', label: 'Pedreiro', icon: '🧱', desc: 'Alvenaria e construção civil' },
  { value: 'limpeza', label: 'Limpeza', icon: '🧹', desc: 'Faxina, limpeza pós-obra e diarista' },
  { value: 'jardinagem', label: 'Jardinagem', icon: '🌱', desc: 'Jardins, poda e áreas verdes' },
  { value: 'transporte', label: 'Transporte/Frete', icon: '🚛', desc: 'Fretes, entregas e mudanças' },
  { value: 'mecanica', label: 'Mecânica', icon: '🔧', desc: 'Automóveis, motos e manutenção' },
  { value: 'outros', label: 'Outro serviço', icon: '🧰', desc: 'Uma categoria de trabalho diferente' },
];

export const CUSTOM_CATEGORY_VALUE = 'custom';

export const slugifyCategoryName = (name = '') => {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

export const prettifyCategoryLabel = (value = '') => {
  if (!value) return 'Serviços';
  const preset = WORK_SERVICE_CATEGORIES.find((category) => category.value === value);
  if (preset) return preset.label;
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Serviços';
};

export const getWorkCategoryInfo = (value) => {
  return WORK_SERVICE_CATEGORIES.find((category) => category.value === value) || {
    value,
    icon: '🧰',
    label: prettifyCategoryLabel(value),
    desc: 'Categoria personalizada',
  };
};