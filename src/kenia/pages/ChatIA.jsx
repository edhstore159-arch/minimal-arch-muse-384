import { useEffect, useRef, useState } from "react";
import { api } from "@/kenia/lib/api";
import { Card } from "@/kenia/components/ui/card";
import { Button } from "@/kenia/components/ui/button";
import { Textarea } from "@/kenia/components/ui/textarea";
import { Input } from "@/kenia/components/ui/input";
import { Badge } from "@/kenia/components/ui/badge";
import { ScrollArea } from "@/kenia/components/ui/scroll-area";
import { Separator } from "@/kenia/components/ui/separator";
import { Progress } from "@/kenia/components/ui/progress";
import { toast } from "sonner";
import {
  Send, Volume2, VolumeX, Sparkles, Bot, Gauge, ShieldCheck,
  AlertTriangle, BookOpen, Loader2, RefreshCcw, Pause, Play,
  CalendarPlus, CalendarCheck, X, Mic, MicOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SCHEDULE_REGEX = /\b(agendar|agendamento|marcar|marca[cç][aã]o|hor[aá]rio|consulta|reuni[aã]o|atendimento|appointment|schedule)\b/i;

const getMeetLink = () => {
  const meetCode = `${Math.random().toString(36).slice(2, 5)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 5)}`;
  return `https://meet.google.com/${meetCode}`;
};

const pad2 = (n) => String(n).padStart(2, "0");
const formatLocalDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Mantém a hora local digitada pelo usuário (sem conversão UTC quebrada).
const getAppointmentDateTime = (date, time) => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
};

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const extractScheduleIntent = (text) => {
  const lower = text.toLowerCase();
  if (!SCHEDULE_REGEX.test(lower)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let date = null;
  const dateMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);

  if (/\bhoje\b/i.test(lower)) {
    date = formatLocalDate(today);
  } else if (/amanh[ãa]/i.test(lower)) {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    date = formatLocalDate(t);
  } else if (/\bdepois de amanh[ãa]\b/i.test(lower)) {
    const t = new Date(today);
    t.setDate(t.getDate() + 2);
    date = formatLocalDate(t);
  } else if (dateMatch) {
    const day = pad2(dateMatch[1]);
    const month = pad2(dateMatch[2]);
    const rawYear = dateMatch[3] || String(today.getFullYear());
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    date = `${year}-${month}-${day}`;
  } else {
    // próximo dia útil às 10h por padrão
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    if (t.getDay() === 0) t.setDate(t.getDate() + 1);
    if (t.getDay() === 6) t.setDate(t.getDate() + 2);
    date = formatLocalDate(t);
  }

  const timeMatch = lower.match(/(\d{1,2})(?::|h)(\d{2})?/i);
  const time = timeMatch
    ? `${pad2(timeMatch[1])}:${pad2(timeMatch[2] || "00")}`
    : "10:00";

  return { date, time, duration: 60 };
};


/**
 * Player de áudio nativo HTML5 que usa Blob URL em vez de data: URL.
 * Data URLs grandes (>~250KB-1MB) silenciam ou falham em iOS Safari e Chrome
 * mobile. Blob URLs via URL.createObjectURL não têm essa limitação.
 */
function NativeAudioPlayer({ audioB64, index }) {
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    if (!audioB64) return;
    let url = null;
    try {
      const bin = atob(audioB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch {
      setBlobUrl(null);
    }
    return () => {
      if (url) {
        try { URL.revokeObjectURL(url); } catch {}
      }
    };
  }, [audioB64]);
  if (!blobUrl) return null;
  return (
    <audio
      controls
      preload="metadata"
      src={blobUrl}
      className="w-full max-w-sm h-9"
      data-testid={`audio-player-${index}`}
    >
      Seu navegador não suporta áudio HTML5.
    </audio>
  );
}

const QUAL_META = {
  qualificado: {
    label: "Qualificado",
    cls: "bg-gold-600 text-white",
    icon: ShieldCheck,
    desc: "Caso com fundamento e chances reais — vale priorizar atendimento.",
  },
  nao_qualificado: {
    label: "Não qualificado",
    cls: "bg-rose-600 text-white",
    icon: AlertTriangle,
    desc: "Caso sem fundamento jurídico suficiente ou fora do escopo.",
  },
  necessita_mais_info: {
    label: "Necessita mais info",
    cls: "bg-nude-700 text-white",
    icon: Gauge,
    desc: "Faltam dados críticos — siga perguntando ao cliente.",
  },
};

export default function ChatIA() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Oi! Aqui é a Kênia Garcia, advogada. ☕\n\nMe conta brevemente o que aconteceu — eu te escuto com calma, organizo seu caso e já te dou as primeiras orientações. Pode começar.",
      audio_base64: null,
    },
  ]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [voice, setVoice] = useState("nova");
  const [autoplay, setAutoplay] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [legDate, setLegDate] = useState("");
  const [legBrief, setLegBrief] = useState("");
  const [playingIdx, setPlayingIdx] = useState(null);
  const [scheduler, setScheduler] = useState(null); // { date, time, duration, area }
  const [scheduling, setScheduling] = useState(false);
  const [leadId, setLeadId] = useState(null);
  const audioRef = useRef(null);
  const scrollRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        await transcribeAndSend(blob, mime);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Não consegui acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  };

  const transcribeAndSend = async (blob, mime) => {
    setTranscribing(true);
    try {
      const buf = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      const audio_base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audio_base64, mime_type: mime },
      });
      if (error) throw error;
      const text = (data?.text || "").trim();
      if (!text) {
        toast.error("Não entendi o áudio. Tente falar mais perto do microfone.");
        return;
      }
      await send(text);
    } catch {
      toast.error("Erro ao transcrever o áudio.");
    } finally {
      setTranscribing(false);
    }
  };

  const upsertLead = async (extra = {}) => {
    const clientName = (name || "").trim();
    const clientPhone = (phone || "").trim();
    if (!clientName && !clientPhone) return;
    try {
      if (leadId) {
        await api.patch(`/leads/${leadId}`, {
          name: clientName || undefined,
          phone: clientPhone || undefined,
          case_type: extra.area || analysis?.area || undefined,
          description: extra.description || analysis?.resumo || undefined,
          urgency: extra.urgency || (analysis?.acertividade > 80 ? "alta" : "media"),
          score: analysis?.acertividade || undefined,
          stage: extra.stage || undefined,
          source: "ChatIA",
        });
      } else {
        const { data } = await api.post("/leads", {
          name: clientName || "Cliente do chat",
          phone: clientPhone || "",
          case_type: extra.area || analysis?.area || "Atendimento jurídico",
          description: extra.description || analysis?.resumo || "Lead gerado pelo atendente virtual.",
          urgency: extra.urgency || "media",
          score: analysis?.acertividade || 60,
          stage: extra.stage || "novos_leads",
          source: "ChatIA",
          tags: ["chatia"],
        });
        if (data?.id) setLeadId(data.id);
      }
    } catch {
      /* silencioso — não bloqueia o chat */
    }
  };


  const openScheduler = (area) => {
    const slot = nextBusinessSlot();
    setScheduler({ date: slot.date, time: slot.time, duration: 60, area: area || analysis?.area || "" });
  };

  const createAppointment = async ({ date, time, duration = 60, area = "" }) => {
    const starts_at = getAppointmentDateTime(date, time);
    const clientName = name?.trim() || "Cliente do chat";
    const meetUrl = getMeetLink();
    const title = `Consulta — ${area || analysis?.area || "Atendimento jurídico"} · ${clientName}`;
    await api.post("/appointments", {
      title,
      client_name: clientName,
      starts_at,
      duration_min: Number(duration) || 60,
      location: "Google Meet",
      meet_url: meetUrl,
      meeting_link: meetUrl,
      notes: [phone ? `WhatsApp: ${phone}` : "", `Meet: ${meetUrl}`].filter(Boolean).join(" · "),
      status: "confirmado",
    });
    const human = new Date(starts_at).toLocaleString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
    });
    return { human, meetUrl, duration: Number(duration) || 60 };
  };

  const confirmSchedule = async () => {
    if (!scheduler?.date || !scheduler?.time) {
      toast.error("Escolha data e horário");
      return;
    }
    setScheduling(true);
    try {
      const { human, meetUrl, duration } = await createAppointment(scheduler);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Consulta agendada para ${human} (${duration} min) por Google Meet.\n\n🔗 Link: ${meetUrl}\n\nO agendamento já aparece no painel da Agenda${phone ? ` e o WhatsApp cadastrado é ${phone}` : ""}.`,
          audio_base64: null,
        },
      ]);
      toast.success("Agendamento confirmado");
      // Marca o lead como qualificado/em negociação ao agendar
      upsertLead({ stage: "em_negociacao", urgency: "alta" });
      setScheduler(null);
    } catch (e) {
      toast.error("Não consegui agendar. Tente novamente.");
    } finally {
      setScheduling(false);
    }
  };

  useEffect(() => {
    // carrega brief diario de legislacao
    api
      .get("/legislation/today")
      .then((r) => {
        setLegDate(r.data.date_human);
        setLegBrief(r.data.brief);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  const playAudio = (b64, idx) => {
    if (!b64) return;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        if (audioRef.current.__blobUrl) URL.revokeObjectURL(audioRef.current.__blobUrl);
      } catch {}
    }
    // FIX: usa Blob URL (object URL) ao invés de data: URL. Data URLs de áudio
    // longos (>~250KB-1MB) silenciam em iOS Safari e em Chrome mobile;
    // URL.createObjectURL() é universalmente confiável e suporta arquivos
    // grandes sem limites de comprimento.
    let blobUrl = null;
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/mpeg" });
      blobUrl = URL.createObjectURL(blob);
    } catch (e) {
      toast.error("Áudio inválido (base64): " + e.message);
      return;
    }
    const a = new Audio(blobUrl);
    a.__blobUrl = blobUrl;
    a.volume = 1.0;
    audioRef.current = a;
    setPlayingIdx(idx);
    a.onended = () => {
      setPlayingIdx(null);
      try { URL.revokeObjectURL(blobUrl); } catch {}
    };
    a.onerror = () => {
      setPlayingIdx(null);
      toast.error("Não consegui tocar o áudio. Verifique o volume do navegador/sistema.");
    };
    a.play().catch((err) => {
      setPlayingIdx(null);
      const isAutoplayBlock = err?.name === "NotAllowedError";
      if (isAutoplayBlock) {
        toast.info("Clique em \"Ouvir resposta\" para escutar — o navegador bloqueou o autoplay.", {
          duration: 4500,
        });
      } else {
        toast.error(`Erro ao tocar áudio: ${err?.message || "desconhecido"}`);
      }
    });
  };

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }
    setPlayingIdx(null);
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    setThinking(true);
    const scheduleIntent = extractScheduleIntent(msg);
    if (scheduleIntent) {
      try {
        const { human, meetUrl, duration } = await createAppointment({
          ...scheduleIntent,
          area: analysis?.area || "Atendimento jurídico",
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `✅ Consulta agendada para ${human} (${duration} min) por Google Meet.\n\n🔗 Link: ${meetUrl}\n\nO agendamento já aparece no painel da Agenda${phone ? ` e o WhatsApp cadastrado é ${phone}` : ""}.`,
            audio_base64: null,
          },
        ]);
        toast.success("Agendamento criado no painel da Agenda");
        upsertLead({ stage: "em_negociacao", urgency: "alta" });
        setScheduler(null);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Não consegui salvar automaticamente agora. Abra o botão Agendar consulta e confirme o horário manualmente.",
            audio_base64: null,
          },
        ]);
        openScheduler(analysis?.area || "Atendimento jurídico");
        toast.error("Não consegui criar o agendamento automaticamente");
      } finally {
        setThinking(false);
      }
      return;
    }
    try {
      const { data } = await api.post(
        "/chat/message",
        {
          message: msg,
          history: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          session_id: sessionId,
          visitor_name: name || null,
          visitor_phone: phone || null,
          voice,
          want_audio: true,
          return_analysis: true,
        },
        { timeout: 90000 }
      );
      setSessionId(data.session_id);
      const newMsg = {
        role: "assistant",
        content: data.response,
        audio_base64: data.audio_base64,
      };
      setMessages((prev) => [...prev, newMsg]);
      if (data.analysis) setAnalysis(data.analysis);
      // Atualiza CRM: cria/atualiza lead automaticamente conforme o chat avança
      upsertLead({ description: msg });
      if (autoplay && data.audio_base64) {
        // auto-play depois do paint
        setTimeout(() => playAudio(data.audio_base64, messages.length + 1), 250);
      }
    } catch (err) {
      toast.error("Erro ao conversar com a IA. Tente novamente.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Desculpe, tive uma instabilidade aqui. Pode repetir sua mensagem? 🙏",
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    setMessages([
      {
        role: "assistant",
        content:
          "Recomeçando do zero. ☕ Aqui é a Kênia Garcia, advogada. Me conta brevemente: o que aconteceu?",
        audio_base64: null,
      },
    ]);
    setSessionId(null);
    setAnalysis(null);
    stopAudio();
  };

  const QM = analysis ? QUAL_META[analysis.qualificacao] || QUAL_META.necessita_mais_info : null;

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="chat-ia-page">
      {/* Header */}
      <div className="px-8 py-5 bg-card border-b border-nude-200 flex items-center justify-between shrink-0">
        <div>
          <div className="overline text-gold-600">Análise de Caso · IA Humanizada</div>
          <h1 className="font-serif text-3xl text-nude-900 mt-1 tracking-tight">
            Kênia Garcia <span className="text-gold-600 italic">— advogada · atende você direto.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className="bg-gold-50 text-gold-700 hover:bg-gold-50 border border-gold-200 gap-1.5 px-3 py-1.5 rounded-full font-medium"
            data-testid="leg-date-badge"
          >
            <BookOpen className="w-3 h-3" /> Legislação · {legDate || "atualizando..."}
          </Badge>
          <Button
            size="sm"
            onClick={() => openScheduler()}
            className="gap-1.5 bg-gold-600 hover:bg-gold-700 text-white"
            data-testid="open-scheduler-btn"
          >
            <CalendarPlus className="w-3.5 h-3.5" /> Agendar consulta
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="gap-1.5"
            data-testid="reset-chat-btn"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Nova conversa
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* CHAT — center 8 cols */}
        <Card
          className="col-span-12 lg:col-span-8 flex flex-col overflow-hidden border-nude-200"
          data-testid="chat-panel"
        >
          {/* visitor info */}
          <div className="px-5 py-3 border-b border-nude-200 bg-nude-50/60 flex items-center gap-3 flex-wrap">
            <Bot className="w-4 h-4 text-gold-600" />
            <span className="text-sm font-medium text-nude-900">Cliente:</span>
            <Input
              placeholder="Nome (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-44 text-xs"
              data-testid="visitor-name-input"
            />
            <Input
              placeholder="WhatsApp (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-8 w-44 text-xs"
              data-testid="visitor-phone-input"
            />
            <span className="text-sm font-medium text-nude-900 ml-auto">Voz:</span>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="h-8 px-2 rounded-md border border-nude-200 bg-white text-xs"
              data-testid="voice-select"
            >
              <option value="nova">Nova (jovem feminina)</option>
              <option value="shimmer">Shimmer (alegre)</option>
              <option value="coral">Coral (acolhedora)</option>
              <option value="fable">Fable (narrativa)</option>
              <option value="alloy">Alloy (neutra)</option>
              <option value="onyx">Onyx (grave masculina)</option>
              <option value="echo">Echo (calma)</option>
            </select>
            <Button
              size="sm"
              variant={autoplay ? "default" : "outline"}
              onClick={() => setAutoplay((v) => !v)}
              className={`h-8 gap-1.5 ${autoplay ? "bg-gold-600 hover:bg-gold-700 text-white" : ""}`}
              data-testid="autoplay-toggle"
            >
              {autoplay ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {autoplay ? "Falar resposta" : "Sem áudio"}
            </Button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 bg-gradient-to-b from-nude-50/40 to-background">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`msg-${i}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
                      m.role === "user"
                        ? "bg-nude-900 text-white rounded-br-sm"
                        : "bg-white border border-nude-200 text-nude-900 rounded-bl-sm"
                    }`}
                  >
                    {m.role === "assistant" && i === 0 && (
                      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold tracking-widest uppercase text-gold-600">
                        <Sparkles className="w-3 h-3" /> Ana · secretária
                      </div>
                    )}
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>
                    {m.role === "assistant" && m.audio_base64 && (
                      <div className="mt-3 space-y-1.5" data-testid={`audio-block-${i}`}>
                        <button
                          onClick={() =>
                            playingIdx === i ? stopAudio() : playAudio(m.audio_base64, i)
                          }
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                            playingIdx === i
                              ? "bg-gold-100 text-gold-900 hover:bg-gold-200"
                              : "bg-gold-600 text-white hover:bg-gold-700"
                          }`}
                          data-testid={`play-audio-${i}`}
                        >
                          {playingIdx === i ? (
                            <>
                              <Pause className="w-3 h-3" /> Pausar áudio
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" /> Ouvir resposta da Kênia
                            </>
                          )}
                        </button>
                        <NativeAudioPlayer audioB64={m.audio_base64} index={i} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-white border border-nude-200 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2 text-sm text-nude-500">
                    <Loader2 className="w-4 h-4 animate-spin text-gold-600" />
                    Ana está digitando…
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* scheduler */}
          {scheduler && (
            <div className="px-4 py-3 border-t border-gold-200 bg-gold-50" data-testid="scheduler-panel">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gold-800">
                    <CalendarCheck className="w-4 h-4" /> Vamos agendar sua consulta
                  </div>
                  <button
                    onClick={() => setScheduler(null)}
                    className="text-nude-600 hover:text-nude-900"
                    aria-label="Fechar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-nude-600">Data</label>
                    <Input
                      type="date"
                      value={scheduler.date}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setScheduler({ ...scheduler, date: e.target.value })}
                      className="h-9"
                      data-testid="sched-date"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-nude-600">Horário</label>
                    <Input
                      type="time"
                      value={scheduler.time}
                      onChange={(e) => setScheduler({ ...scheduler, time: e.target.value })}
                      className="h-9"
                      data-testid="sched-time"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-nude-600">Duração</label>
                    <select
                      value={scheduler.duration}
                      onChange={(e) => setScheduler({ ...scheduler, duration: Number(e.target.value) })}
                      className="h-9 w-full rounded-md border border-nude-200 bg-white px-2 text-sm"
                      data-testid="sched-duration"
                    >
                      {[30, 45, 60, 90].map((m) => (
                        <option key={m} value={m}>{m} min</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={confirmSchedule}
                      disabled={scheduling}
                      className="w-full h-9 bg-gold-600 hover:bg-gold-700 text-white gap-1.5"
                      data-testid="sched-confirm"
                    >
                      {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                      Confirmar
                    </Button>
                  </div>
                </div>
                {!name && (
                  <p className="text-[11px] text-gold-800 mt-2">
                    Se o nome não for preenchido, o compromisso será salvo como Cliente do chat.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* input */}
          <div className="p-4 border-t border-nude-200 bg-white">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <Textarea
                placeholder="Conte com calma o que aconteceu… (Enter envia)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={thinking}
                rows={2}
                className="resize-none flex-1"
                data-testid="chat-input"
              />
              <Button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={thinking || transcribing}
                title={recording ? "Parar gravação" : "Gravar mensagem de áudio"}
                className={`h-12 px-4 ${recording ? "bg-red-600 hover:bg-red-700" : "bg-nude-200 hover:bg-nude-300 text-nude-800"}`}
                data-testid="chat-mic-btn"
              >
                {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Button
                onClick={() => send()}
                disabled={thinking || transcribing || !input.trim()}
                className="h-12 px-5 bg-gold-600 hover:bg-gold-700 text-white"
                data-testid="chat-send-btn"
              >
                <Send className="w-4 h-4 mr-2" /> Enviar
              </Button>
            </div>
          </div>
        </Card>

        {/* ANALYSIS SIDE — 4 cols */}
        <Card
          className="col-span-12 lg:col-span-4 flex flex-col overflow-hidden border-nude-200"
          data-testid="analysis-panel"
        >
          <div className="px-5 py-3 border-b border-nude-200 bg-nude-50/60">
            <div className="overline text-gold-600">Análise em tempo real</div>
            <h2 className="font-serif text-xl text-nude-900 mt-0.5">Acertividade do caso</h2>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-5 space-y-5">
              {!analysis ? (
                <div className="text-sm text-nude-500 text-center py-10">
                  A análise aparecerá aqui assim que a Dra. Ana ouvir os primeiros detalhes do seu caso.
                </div>
              ) : (
                <>
                  {/* Qualification badge */}
                  <div>
                    <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-2">
                      Qualificação
                    </div>
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full ${QM.cls}`} data-testid="qualif-badge">
                      <QM.icon className="w-4 h-4" /> {QM.label}
                    </div>
                    <p className="text-xs text-nude-600 mt-2 leading-relaxed">{QM.desc}</p>
                  </div>

                  <Separator />

                  {/* acertividade gauge */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs tracking-widest uppercase font-semibold text-nude-500">
                        Índice de acertividade
                      </span>
                      <span className="text-2xl font-serif text-gold-700" data-testid="acertividade-value">
                        {analysis.acertividade}%
                      </span>
                    </div>
                    <Progress value={analysis.acertividade} className="h-2 bg-nude-100" />
                    <p className="text-[11px] text-nude-500 mt-1.5">
                      Quanto mais informações precisas você der, maior fica esse índice.
                    </p>
                  </div>

                  {/* chance exito */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs tracking-widest uppercase font-semibold text-nude-500">
                        Chance real de êxito
                      </span>
                      <span className="text-2xl font-serif text-nude-900" data-testid="chance-exito-value">
                        {analysis.chance_exito}%
                      </span>
                    </div>
                    <Progress value={analysis.chance_exito} className="h-2 bg-nude-100" />
                  </div>

                  <Separator />

                  {/* area */}
                  <div>
                    <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-1.5">
                      Área do direito
                    </div>
                    <Badge className="bg-gold-100 text-gold-800 hover:bg-gold-100" data-testid="area-badge">
                      {analysis.area || "Em análise"}
                    </Badge>
                  </div>

                  {/* resumo */}
                  {analysis.resumo && (
                    <div>
                      <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-1.5">
                        Resumo técnico
                      </div>
                      <p className="text-sm text-nude-700 leading-relaxed bg-nude-50 border border-nude-200 rounded-md p-3">
                        {analysis.resumo}
                      </p>
                    </div>
                  )}

                  {/* motivo */}
                  {analysis.motivo && (
                    <div>
                      <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-1.5">
                        Por quê?
                      </div>
                      <p className="text-sm text-nude-700 leading-relaxed">{analysis.motivo}</p>
                    </div>
                  )}

                  {/* proxima pergunta */}
                  {analysis.proxima_pergunta && (
                    <div className="bg-gold-50 border border-gold-200 rounded-md p-3">
                      <div className="text-xs tracking-widest uppercase font-semibold text-gold-700 mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> Pergunta-chave que vai elevar a acertividade
                      </div>
                      <p className="text-sm text-nude-900 leading-relaxed font-medium" data-testid="next-question">
                        {analysis.proxima_pergunta}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 text-gold-700 hover:bg-gold-100 h-7 text-xs"
                        onClick={() => send(analysis.proxima_pergunta)}
                        data-testid="ask-next-question-btn"
                      >
                        Usar essa pergunta →
                      </Button>
                    </div>
                  )}

                  {/* fundamentos */}
                  {analysis.fundamentos && analysis.fundamentos.length > 0 && (
                    <div>
                      <div className="text-xs tracking-widest uppercase font-semibold text-nude-500 mb-2">
                        Fundamentos jurídicos
                      </div>
                      <ul className="space-y-1.5">
                        {analysis.fundamentos.map((f, i) => (
                          <li
                            key={i}
                            className="text-xs text-nude-700 bg-nude-50 border border-nude-200 rounded-md px-2.5 py-1.5"
                          >
                            <span className="font-medium text-gold-700">§</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* legislacao do dia */}
              {legBrief && (
                <>
                  <Separator />
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gold-700 font-medium flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3" /> Atualização legal de {legDate}
                    </summary>
                    <p className="mt-2 text-nude-600 whitespace-pre-wrap leading-relaxed">{legBrief}</p>
                  </details>
                </>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
