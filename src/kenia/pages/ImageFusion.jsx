import { useEffect, useState, useRef } from "react";
import JSZip from "jszip";
import { api } from "@/kenia/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/kenia/components/ui/card";
import { Button } from "@/kenia/components/ui/button";
import { Textarea } from "@/kenia/components/ui/textarea";
import { Label } from "@/kenia/components/ui/label";
import { Input } from "@/kenia/components/ui/input";
import { Badge } from "@/kenia/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/kenia/components/ui/dialog";
import { toast } from "sonner";
import { Combine, Upload, Loader2, Download, X, Sparkles, ImageIcon, Package, Info, CalendarClock, Trash2 } from "lucide-react";

// Presets oficiais para redes sociais (px)
const SOCIAL_PRESETS = [
  { group: "Instagram", name: "Feed Quadrado",   w: 1080, h: 1080 },
  { group: "Instagram", name: "Feed Vertical",   w: 1080, h: 1350 },
  { group: "Instagram", name: "Stories",         w: 1080, h: 1920 },
  { group: "Instagram", name: "Reels",           w: 1080, h: 1920 },
  { group: "Instagram", name: "Carrossel",       w: 1080, h: 1350 },
  { group: "Facebook",  name: "Feed",            w: 1080, h: 1350 },
  { group: "Facebook",  name: "Story",           w: 1080, h: 1920 },
  { group: "Facebook",  name: "Capa Página",     w: 1640, h: 624  },
  { group: "TikTok",    name: "Vídeo Vertical",  w: 1080, h: 1920 },
  { group: "TikTok",    name: "Capa Vídeo",      w: 1080, h: 1920 },
  { group: "LinkedIn",  name: "Post Quadrado",   w: 1080, h: 1080 },
  { group: "LinkedIn",  name: "Post Vertical",   w: 1080, h: 1350 },
  { group: "LinkedIn",  name: "Banner Perfil",   w: 1584, h: 396  },
  { group: "X",         name: "Post Imagem",     w: 1600, h: 900  },
  { group: "X",         name: "Capa Perfil",     w: 1500, h: 500  },
  { group: "YouTube",   name: "Thumbnail",       w: 1280, h: 720  },
  { group: "YouTube",   name: "Shorts",          w: 1080, h: 1920 },
  { group: "YouTube",   name: "Banner Canal",    w: 2560, h: 1440 },
  { group: "Pinterest", name: "Pin Vertical",    w: 1000, h: 1500 },
  { group: "WhatsApp",  name: "Status",          w: 1080, h: 1920 },
];

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X (Twitter)" },
  { id: "pinterest", label: "Pinterest" },
  { id: "whatsapp", label: "WhatsApp" },
];

const platformFromGroup = (group = "") => {
  const id = slug(group);
  return id === "twitter" ? "x" : id;
};

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const imageToBase64 = (value) => String(value || "").replace(/^data:image\/\w+;base64,/, "");

// Cobre o canvas com a imagem original (cover/crop centralizado).
function renderPresetToCanvas(img, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const ir = img.width / img.height;
  const tr = w / h;
  let sx, sy, sw, sh;
  if (ir > tr) {
    // imagem mais larga -> recorta laterais
    sh = img.height;
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / tr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function ImagePicker({ value, onChange, label, testidPrefix }) {
  const inputRef = useRef(null);
  return (
    <div className="space-y-2">
      <Label className="text-gold-200">{label}</Label>
      <div
        onClick={() => inputRef.current?.click()}
        className="relative aspect-square rounded-lg border-2 border-dashed border-gold-700/40 bg-nude-900/40 hover:border-gold-500/60 hover:bg-nude-900/60 transition-colors cursor-pointer overflow-hidden grid place-items-center"
        data-testid={`${testidPrefix}-dropzone`}
      >
        {value ? (
          <>
            <img src={value} alt="preview" className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-nude-950/80 grid place-items-center hover:bg-rose-600 transition-colors"
              data-testid={`${testidPrefix}-clear`}
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </>
        ) : (
          <div className="text-center px-6">
            <Upload className="w-8 h-8 text-gold-400/60 mx-auto mb-2" />
            <div className="text-sm text-gold-200/80 font-medium">Clique para enviar</div>
            <div className="text-xs text-nude-500 mt-1">PNG, JPG até 8 MB</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid={`${testidPrefix}-input`}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) { toast.error("Imagem deve ter até 8 MB"); return; }
            const b64 = await fileToBase64(file);
            onChange(b64);
          }}
        />
      </div>
    </div>
  );
}

export default function ImageFusion() {
  const [img1, setImg1] = useState(null);
  const [img2, setImg2] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [variants, setVariants] = useState([]); // {preset, dataUrl, blob}
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [scheduled, setScheduled] = useState([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    caption: "",
    hashtags: "",
    scheduled_for: "",
    platforms: ["instagram"],
  });

  useEffect(() => { loadScheduled(); }, []);

  const loadScheduled = async () => {
    try {
      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("*")
        .ilike("creative_id", "fusion-%")
        .order("scheduled_for", { ascending: true, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      setScheduled(data || []);
    } catch {
      setScheduled([]);
    }
  };

  const togglePlatform = (id) => {
    setScheduleForm((s) => ({
      ...s,
      platforms: s.platforms.includes(id)
        ? s.platforms.filter((p) => p !== id)
        : [...s.platforms, id],
    }));
  };

  const openSchedule = (target = null) => {
    const targetPlatforms = target?.preset?.group ? [platformFromGroup(target.preset.group)] : ["instagram"];
    const platforms = targetPlatforms.filter((p) => PLATFORMS.some((item) => item.id === p));
    setScheduleTarget(target || { dataUrl: result, preset: { group: "Fusão", name: "Original" } });
    setScheduleForm({
      caption: prompt || "Imagem criada no Estúdio de Fusão.",
      hashtags: "",
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
      platforms: platforms.length ? platforms : ["instagram"],
    });
    setScheduleOpen(true);
  };

  const saveSchedule = async () => {
    if (!scheduleTarget) return;
    if (!scheduleForm.platforms.length) { toast.error("Selecione pelo menos uma rede"); return; }
    if (!scheduleForm.scheduled_for) { toast.error("Defina data e hora"); return; }
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) { toast.error("Faça login para agendar publicações"); return; }
      const preset = scheduleTarget.preset || {};
      const title = preset.group === "Fusão" ? "Fusão de imagens · Original" : `Fusão · ${preset.group} ${preset.name}`;
      const { error } = await supabase.from("scheduled_posts").insert({
        user_id: userId,
        creative_id: `fusion-${Date.now()}`,
        title,
        caption: scheduleForm.caption,
        hashtags: scheduleForm.hashtags || null,
        image_b64: imageToBase64(scheduleTarget.dataUrl || result),
        platforms: scheduleForm.platforms,
        scheduled_for: new Date(scheduleForm.scheduled_for).toISOString(),
        status: "scheduled",
      });
      if (error) throw error;
      toast.success("Fusão agendada na fila de publicações.");
      setScheduleOpen(false);
      setScheduleTarget(null);
      loadScheduled();
    } catch (e) {
      toast.error(`Não foi possível agendar: ${e.message || e}`);
    }
  };

  const cancelScheduled = async (id) => {
    if (!confirm("Cancelar este agendamento?")) return;
    await supabase.from("scheduled_posts").delete().eq("id", id);
    loadScheduled();
  };

  const fuse = async () => {
    if (!img1 || !img2) { toast.error("Envie as duas imagens antes de gerar"); return; }
    setLoading(true);
    setResult(null);
    setVariants([]);
    try {
      const { data } = await api.post(
        "/creatives/fuse-images",
        { image1_base64: img1, image2_base64: img2, prompt },
        { timeout: 180000 }
      );
      if (data.ok && data.image) {
        setResult(data.image);
        toast.success("Imagem gerada! Gerando variações para redes sociais...");
        await generateVariants(data.image);
      } else {
        toast.error(data.error || "Não foi possível gerar a imagem");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao gerar imagem");
    } finally {
      setLoading(false);
    }
  };

  const generateVariants = async (sourceUrl) => {
    setGeneratingVariants(true);
    try {
      const img = await loadImage(sourceUrl);
      const out = [];
      for (const preset of SOCIAL_PRESETS) {
        const canvas = renderPresetToCanvas(img, preset.w, preset.h);
        const blob = await canvasToBlob(canvas, "image/png");
        const dataUrl = canvas.toDataURL("image/png");
        out.push({ preset, dataUrl, blob });
      }
      setVariants(out);
      toast.success(`${out.length} variações criadas`);
    } catch (e) {
      toast.error("Falha ao recortar variações: " + (e?.message || ""));
    } finally {
      setGeneratingVariants(false);
    }
  };

  const downloadOne = (v) => {
    const a = document.createElement("a");
    a.href = v.dataUrl;
    a.download = `kenia-${slug(v.preset.group)}-${slug(v.preset.name)}-${v.preset.w}x${v.preset.h}.png`;
    a.click();
  };

  const downloadOriginal = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = `fusao-original-${Date.now()}.png`;
    a.click();
  };

  const downloadAllZip = async () => {
    if (variants.length === 0) return;
    const zip = new JSZip();
    for (const v of variants) {
      const folder = zip.folder(v.preset.group) || zip;
      folder.file(`${slug(v.preset.name)}-${v.preset.w}x${v.preset.h}.png`, v.blob);
    }
    if (result) {
      const r = await fetch(result);
      const b = await r.blob();
      zip.file("ORIGINAL.png", b);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pack-redes-sociais-${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="h-screen flex flex-col bg-nude-950 overflow-hidden text-gold-50">
      <div className="px-6 py-4 bg-nude-900/60 border-b border-gold-900/40">
        <div className="text-xs tracking-[0.2em] uppercase text-gold-400 font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Estúdio criativo
        </div>
        <h1 className="font-display font-bold text-2xl mt-1 text-gold-100 flex items-center gap-2">
          <Combine className="w-6 h-6 text-gold-400" />
          Fusão de Imagens com IA · Pack Redes Sociais
        </h1>
        <p className="text-sm text-nude-400 mt-1">
          Envie duas imagens, gere a fusão e baixe automaticamente todas as variações (Instagram, Facebook, TikTok, LinkedIn, X, YouTube, Pinterest, WhatsApp).
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_1fr_1.2fr] gap-5">
          <Card className="p-4 bg-nude-900/60 border-gold-900/40">
            <ImagePicker value={img1} onChange={setImg1} label="Imagem 1" testidPrefix="img1" />
          </Card>
          <Card className="p-4 bg-nude-900/60 border-gold-900/40">
            <ImagePicker value={img2} onChange={setImg2} label="Imagem 2" testidPrefix="img2" />
          </Card>
          <Card className="p-4 bg-nude-900/60 border-gold-900/40 flex flex-col">
            <Label className="text-gold-200">Resultado base</Label>
            <div className="mt-2 aspect-square rounded-lg bg-nude-950 border border-gold-900/40 grid place-items-center overflow-hidden">
              {loading ? (
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-2" />
                  <div className="text-sm text-gold-200">Gerando fusão... 20-40s</div>
                </div>
              ) : result ? (
                <img src={result} alt="resultado" className="w-full h-full object-cover" data-testid="fusion-result-img" />
              ) : (
                <div className="text-center text-nude-500">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <div className="text-xs">Resultado aparecerá aqui</div>
                </div>
              )}
            </div>
            {result && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button onClick={downloadOriginal} variant="outline" size="sm"
                  className="border-gold-700/50 text-gold-200 hover:bg-gold-500/10 hover:text-gold-100">
                  <Download className="w-4 h-4 mr-2" /> Baixar
                </Button>
                <Button onClick={() => openSchedule()} variant="outline" size="sm"
                  className="border-gold-700/50 text-gold-200 hover:bg-gold-500/10 hover:text-gold-100">
                  <CalendarClock className="w-4 h-4 mr-2" /> Agendar
                </Button>
              </div>
            )}
          </Card>
        </div>

        <Card className="max-w-5xl mx-auto p-5 bg-nude-900/60 border-gold-900/40 mt-5">
          <Label className="text-gold-200">Instrução adicional (opcional)</Label>
          <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: Mescle as duas imagens em estilo dourado elegante"
            data-testid="fusion-prompt"
            className="bg-nude-950 border-gold-900/40 text-gold-100 placeholder:text-nude-600 mt-1.5" />
          <div className="flex justify-end mt-4">
            <Button onClick={fuse} disabled={loading || !img1 || !img2}
              className="bg-gradient-to-r from-gold-500 to-gold-700 hover:from-gold-400 hover:to-gold-600 text-nude-950 font-semibold"
              data-testid="fusion-generate">
              {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>) :
               (<><Sparkles className="w-4 h-4 mr-2" />Gerar fusão + pack redes sociais</>)}
            </Button>
          </div>
        </Card>

        {(generatingVariants || variants.length > 0) && (
          <Card className="max-w-5xl mx-auto p-5 bg-nude-900/60 border-gold-900/40 mt-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <Label className="text-gold-200 text-base">
                  Variações ({variants.length}/{SOCIAL_PRESETS.length})
                </Label>
                <p className="text-xs text-nude-400 mt-0.5">Recorte centralizado (cover) em cada formato oficial.</p>
              </div>
              {variants.length > 0 && (
                <Button onClick={downloadAllZip}
                  className="bg-gradient-to-r from-gold-500 to-gold-700 hover:from-gold-400 hover:to-gold-600 text-nude-950 font-semibold">
                  <Package className="w-4 h-4 mr-2" /> Baixar pack completo (.zip)
                </Button>
              )}
            </div>

            {generatingVariants && variants.length === 0 ? (
              <div className="py-10 text-center text-gold-200">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Recortando variações...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {variants.map((v) => (
                  <div key={`${v.preset.group}-${v.preset.name}`}
                    className="bg-nude-950 border border-gold-900/40 rounded-md overflow-hidden flex flex-col">
                    <div className="bg-black/40 grid place-items-center" style={{ aspectRatio: `${v.preset.w} / ${v.preset.h}` }}>
                      <img src={v.dataUrl} alt={v.preset.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-2 text-[11px]">
                      <div className="text-gold-300 font-semibold truncate">{v.preset.group} · {v.preset.name}</div>
                      <div className="text-nude-500">{v.preset.w} × {v.preset.h}</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        <button onClick={() => downloadOne(v)}
                          className="text-[10px] py-1 rounded bg-gold-600/20 hover:bg-gold-500/30 text-gold-200 flex items-center justify-center gap-1">
                          <Download className="w-3 h-3" /> Baixar
                        </button>
                        <button onClick={() => openSchedule(v)}
                          className="text-[10px] py-1 rounded bg-gold-600/20 hover:bg-gold-500/30 text-gold-200 flex items-center justify-center gap-1">
                          <CalendarClock className="w-3 h-3" /> Agendar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 p-3 rounded-md bg-nude-950/60 border border-gold-900/40 flex gap-2 text-xs text-nude-300">
              <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-gold-200">Publicação automática agendada:</strong> requer conectar as contas oficiais
                de cada rede (Instagram/Facebook via Meta Graph API, LinkedIn API, TikTok for Business, YouTube Data API, X API).
                Posso plugar essas integrações via Lovable Cloud — peça "conectar Meta" / "conectar LinkedIn" e eu configuro o OAuth e o agendamento de posts.
                Por enquanto, baixe o pack .zip e poste manualmente em cada rede.
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
