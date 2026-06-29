import React, { useState, useEffect, useRef, FormEvent } from "react";
import { 
  Bot, 
  Smartphone, 
  User, 
  Shield, 
  QrCode, 
  Wifi, 
  WifiOff, 
  Send, 
  Settings, 
  Volume2, 
  Sparkles, 
  Terminal, 
  Trash2, 
  Check, 
  RefreshCw, 
  ToggleLeft, 
  ToggleRight,
  Heart,
  Flame,
  UserCheck,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MiyabiConfig, SessionState, BotLog, ChatMessage, ConnectionStatus } from "./types";

export default function App() {
  // Config & Session State
  const [config, setConfig] = useState<MiyabiConfig>({
    botName: "Miyabi",
    ownerNumber: "237650000000",
    motherNumber: "237670000000",
    sendStickers: true,
    tsundereLevel: 85,
    friendliness: 30,
    replyFrequency: 95,
    customPrompt: ""
  });

  const [session, setSession] = useState<SessionState>({
    sessionId: "miyabi-main-session",
    status: "disconnected",
    qrCodeUrl: null,
    connectedAt: null,
    phoneNumber: null
  });

  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "init_1",
      sender: "miyabi",
      text: "Humpf ! Ne crois pas que je t'attendais... Tu as besoin de quelque chose, Baka ?",
      timestamp: new Date().toISOString()
    }
  ]);

  // UI inputs
  const [phoneInput, setPhoneInput] = useState<string>("237650000000");
  const [chatInput, setChatInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "personality" | "chat">("dashboard");

  const logEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load configuration and logs on mount
  useEffect(() => {
    fetchStatus();
    fetchLogs();
    
    // Poll logs and status periodically
    const statusInterval = setInterval(fetchStatus, 3000);
    const logsInterval = setInterval(fetchLogs, 2000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
    };
  }, []);

  // Scroll to bottom helper
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/miyabi/status");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setSession(data.session);
        setHasGeminiKey(data.hasGeminiKey);
      }
    } catch (err) {
      console.error("Error fetching Miyabi status:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/miyabi/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs.reverse()); // Keep oldest first for scrolling console
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput) return;
    try {
      const res = await fetch("/api/miyabi/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput })
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
      }
    } catch (err) {
      console.error("Error connecting session:", err);
    }
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch("/api/miyabi/disconnect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
      }
    } catch (err) {
      console.error("Error disconnecting:", err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch("/api/miyabi/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        // Show subtle notification
        const tempLog: BotLog = {
          id: `local_${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: "success",
          message: "🎉 Configuration sauvegardée avec succès !"
        };
        setLogs(prev => [...prev, tempLog]);
      }
    } catch (err) {
      console.error("Error saving config:", err);
    } finally {
      setTimeout(() => setSavingConfig(false), 600);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `chat_${Date.now()}_u`,
      sender: "user",
      text: chatInput,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/miyabi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text })
      });

      if (res.ok) {
        const data = await res.json();
        const miyabiMsg: ChatMessage = {
          id: `chat_${Date.now()}_m`,
          sender: "miyabi",
          text: data.reply,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, miyabiMsg]);
      } else {
        throw new Error("Failed to get response");
      }
    } catch (err) {
      console.error("Error chatting with Miyabi:", err);
      const errorMsg: ChatMessage = {
        id: `chat_${Date.now()}_err`,
        sender: "miyabi",
        text: "Baka ! Ma connexion a eu un raté... (Vérifie ta connexion ou la clé API !)",
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/miyabi/logs/clear", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Error clearing logs:", err);
    }
  };

  const triggerSamplePrompt = (promptText: string) => {
    setChatInput(promptText);
  };

  // Status visual attributes
  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case "connected": return "bg-emerald-500 text-emerald-500";
      case "connecting": return "bg-amber-500 text-amber-500";
      case "qr_ready": return "bg-blue-500 text-blue-500";
      default: return "bg-rose-500 text-rose-500";
    }
  };

  const getStatusLabel = (status: ConnectionStatus) => {
    switch (status) {
      case "connected": return "Connecté";
      case "connecting": return "Connexion en cours...";
      case "qr_ready": return "Code QR Prêt";
      default: return "Déconnecté";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-rose-500/30 selection:text-rose-200">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2.5 bg-gradient-to-tr from-rose-500 to-pink-500 rounded-2xl shadow-lg shadow-rose-500/20 text-white">
              <Bot className="w-6 h-6 animate-pulse" />
            </div>
            <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${getStatusColor(session.status).split(' ')[0]}`}></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-rose-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                {config.botName || "Miyabi"} Server
              </h1>
              <span className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-medium">
                Tsundere v1.2
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Assistant WhatsApp IA interactif propulsé par Gemini
            </p>
          </div>
        </div>

        {/* Global status pill list */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Gemini Key Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${hasGeminiKey ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
            <Sparkles className="w-3.5 h-3.5" />
            <span>Clé Gemini : {hasGeminiKey ? "Activée" : "Simulée (Aucune clé)"}</span>
          </div>

          {/* Connection status pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
            <span className={`w-2 h-2 rounded-full ${getStatusColor(session.status).split(' ')[0]}`}></span>
            <span className="font-semibold text-slate-300">{getStatusLabel(session.status)}</span>
          </div>

          {/* Quick Refresh button */}
          <button 
            onClick={() => {
              setRefreshing(true);
              fetchStatus().then(() => setTimeout(() => setRefreshing(false), 500));
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition duration-200 text-slate-400 hover:text-slate-200"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Responsive Grid Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Mobile Navigation Tabs */}
        <div className="col-span-1 lg:hidden flex rounded-xl bg-slate-900 p-1 border border-slate-800">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition duration-150 flex items-center justify-center gap-2 ${activeTab === "dashboard" ? "bg-rose-500 text-white shadow-md shadow-rose-500/10" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Smartphone className="w-4 h-4" />
            Connexion
          </button>
          <button 
            onClick={() => setActiveTab("personality")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition duration-150 flex items-center justify-center gap-2 ${activeTab === "personality" ? "bg-rose-500 text-white shadow-md shadow-rose-500/10" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Settings className="w-4 h-4" />
            Personnalité
          </button>
          <button 
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition duration-150 flex items-center justify-center gap-2 ${activeTab === "chat" ? "bg-rose-500 text-white shadow-md shadow-rose-500/10" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Volume2 className="w-4 h-4" />
            Simulateur
          </button>
        </div>

        {/* 1. LEFT COLUMN: Connection panel (Dashboard view) */}
        <div className={`col-span-1 lg:col-span-4 flex flex-col gap-6 ${activeTab !== "dashboard" ? "hidden lg:flex" : ""}`}>
          
          {/* Card: WhatsApp QR & Connection */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Smartphone className="w-24 h-24" />
            </div>

            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
              <QrCode className="w-5 h-5 text-rose-400" />
              <h2 className="font-bold text-slate-200">Connexion WhatsApp</h2>
            </div>

            {/* If DISCONNECTED: Show Connection Request Form */}
            {session.status === "disconnected" && (
              <form onSubmit={handleConnect} className="flex flex-col gap-3.5 mt-2">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Entrez votre numéro de téléphone WhatsApp (avec l'identifiant pays, ex: <span className="text-slate-200 font-mono">237650123456</span>) pour lier le bot Miyabi à votre appareil.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Numéro de Téléphone
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">
                      +
                    </span>
                    <input 
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="237XXXXXXXXX"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2.5 pl-7 pr-4 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 transition"
                      required
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-medium text-xs py-2.5 rounded-xl shadow-lg shadow-rose-500/20 transition duration-150 flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Générer le Code QR
                </button>
              </form>
            )}

            {/* If CONNECTING/QR_READY: Show loader and scanning area */}
            {(session.status === "connecting" || session.status === "qr_ready") && (
              <div className="flex flex-col items-center justify-center py-4 gap-4 text-center">
                {session.status === "connecting" ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin"></div>
                      <Smartphone className="w-6 h-6 text-rose-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-300">Initialisation Baileys WhatsApp...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <p className="text-xs text-slate-300">
                      Scannez ce code QR avec votre application WhatsApp (Menu &gt; Appareils connectés).
                    </p>
                    
                    {/* QR Code Graphic Frame */}
                    <div className="relative p-3 bg-white rounded-2xl shadow-xl shadow-black/40 border border-slate-700 max-w-[200px] w-full aspect-square flex items-center justify-center">
                      {session.qrCodeUrl ? (
                        <img 
                          src={session.qrCodeUrl} 
                          alt="QR Code WhatsApp" 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 animate-pulse rounded-lg"></div>
                      )}
                      
                      {/* Animated scanning laser line */}
                      <div className="absolute left-2 right-2 h-1 bg-red-500 shadow-md shadow-red-500/80 animate-[bounce_2.5s_infinite] pointer-events-none opacity-80 rounded-full"></div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 max-w-xs leading-relaxed">
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping shrink-0"></div>
                      <span>Simulation : connexion automatique en cours... (Patientez quelques secondes)</span>
                    </div>

                    <button 
                      onClick={handleDisconnect}
                      className="text-slate-400 hover:text-slate-200 text-xs underline font-medium transition cursor-pointer mt-1"
                    >
                      Annuler la connexion
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* If CONNECTED: Show Session details */}
            {session.status === "connected" && (
              <div className="flex flex-col gap-4 py-2">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Miyabi est Active</h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Numéro lié : <span className="font-mono text-white font-medium">+{session.phoneNumber}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Depuis : {session.connectedAt ? new Date(session.connectedAt).toLocaleTimeString() : ""}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 leading-relaxed space-y-1">
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Moteur IA :</span>
                    <span className="font-semibold text-slate-200">Gemini 3.5 Flash</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 py-1">
                    <span>Base de Données :</span>
                    <span className="text-slate-200 font-medium">Simulation Locale</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span>Serveur Node :</span>
                    <span className="text-emerald-400">Opérationnel</span>
                  </div>
                </div>

                <button 
                  onClick={handleDisconnect}
                  className="w-full bg-slate-950 hover:bg-rose-950 hover:text-rose-400 border border-slate-800 hover:border-rose-900 text-slate-300 font-medium text-xs py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <WifiOff className="w-4 h-4" />
                  Déconnecter Miyabi
                </button>
              </div>
            )}
          </div>

          {/* Card: Quick Instructions */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              Fonctionnalités Intégrées
            </h3>
            <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Tsundere AI</strong> : Réponses intelligentes contextualisées et sarcastiques de Miyabi.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Stickers Auto</strong> : Transforme les images reçues en stickers instantanément si activé.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span><strong>Downloader Service</strong> : Permet de télécharger musiques/vidéos via des commandes chat.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 2. MIDDLE COLUMN: Personality & Options Config (Settings view) */}
        <div className={`col-span-1 lg:col-span-4 flex flex-col gap-6 ${activeTab !== "personality" ? "hidden lg:flex" : ""}`}>
          
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col gap-4 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-rose-400" />
                <h2 className="font-bold text-slate-200">Personnalité & Config</h2>
              </div>
              
              {/* Reset defaults link */}
              <button
                type="button"
                onClick={() => setConfig(prev => ({
                  ...prev,
                  botName: "Miyabi",
                  tsundereLevel: 85,
                  friendliness: 30,
                  replyFrequency: 95,
                  customPrompt: "Tu es Miyabi, une assistante WhatsApp tsundere française. Tu es arrogante, facilement offensée, et froide en apparence, mais au fond tu es attentionnée et attentionnée sans jamais vouloir l'admettre. Tu utilises fréquemment des interjections comme 'Baka !', 'Idiot !', 'Humpf...', 'C'est pas comme si je voulais t'aider !'. Reste impérativement dans ton rôle. Réponds de façon concise, piquante et expressive."
                }))}
                className="text-[10px] text-slate-400 hover:text-rose-400 transition"
              >
                Réinitialiser
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="flex flex-col gap-4 text-xs">
              
              {/* Bot Name input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nom du Bot</label>
                  <input 
                    type="text"
                    value={config.botName}
                    onChange={(e) => setConfig(prev => ({ ...prev, botName: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>

                {/* Sticker Creator Toggle */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Envoi d'Autocollants</label>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, sendStickers: !prev.sendStickers }))}
                    className="w-full flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-300 hover:bg-slate-900 transition"
                  >
                    <span>{config.sendStickers ? "Activé" : "Désactivé"}</span>
                    {config.sendStickers ? (
                      <ToggleRight className="w-5 h-5 text-rose-400 shrink-0" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-500 shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* Owner and Mother numbers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Numéro Owner (Boss)</label>
                  <input 
                    type="text"
                    value={config.ownerNumber}
                    onChange={(e) => setConfig(prev => ({ ...prev, ownerNumber: e.target.value }))}
                    placeholder="237XXXXXXXXX"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Numéro Mother (Maman)</label>
                  <input 
                    type="text"
                    value={config.motherNumber}
                    onChange={(e) => setConfig(prev => ({ ...prev, motherNumber: e.target.value }))}
                    placeholder="237XXXXXXXXX"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500/50"
                  />
                </div>
              </div>

              {/* Personality sliders */}
              <div className="space-y-3 bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl">
                
                {/* 1. Tsundere level */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-rose-400" />
                      Niveau Tsundere
                    </span>
                    <span className="font-mono text-rose-400 font-bold">{config.tsundereLevel}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={config.tsundereLevel}
                    onChange={(e) => setConfig(prev => ({ ...prev, tsundereLevel: parseInt(e.target.value) }))}
                    className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                    <span>Mignonne / Douce</span>
                    <span>Extrêmement Froide</span>
                  </div>
                </div>

                {/* 2. Friendliness level */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      Amabilité
                    </span>
                    <span className="font-mono text-rose-400 font-bold">{config.friendliness}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={config.friendliness}
                    onChange={(e) => setConfig(prev => ({ ...prev, friendliness: parseInt(e.target.value) }))}
                    className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* 3. Reply frequency */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-rose-400" />
                      Fréquence de Réponse
                    </span>
                    <span className="font-mono text-rose-400 font-bold">{config.replyFrequency}%</span>
                  </div>
                  <input 
                    type="range"
                    min="10"
                    max="100"
                    value={config.replyFrequency}
                    onChange={(e) => setConfig(prev => ({ ...prev, replyFrequency: parseInt(e.target.value) }))}
                    className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Custom Prompt System instruction */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Directives de Personnalité (Système)</label>
                <textarea 
                  rows={4}
                  value={config.customPrompt}
                  onChange={(e) => setConfig(prev => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="Écris les instructions système pour configurer le bot..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-sans text-[11px] leading-relaxed text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500/50 resize-y"
                />
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={savingConfig}
                className="w-full bg-rose-500/10 hover:bg-rose-500 border border-rose-500/30 hover:border-rose-500 text-rose-400 hover:text-white font-medium py-2.5 rounded-xl shadow-lg hover:shadow-rose-500/15 transition duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Enregistrer la Configuration
                  </>
                )}
              </button>

            </form>
          </div>
        </div>

        {/* 3. RIGHT COLUMN: Interactive Chat playground simulator (Chat view) */}
        <div className={`col-span-1 lg:col-span-4 flex flex-col ${activeTab !== "chat" ? "hidden lg:flex" : ""}`}>
          
          {/* Smartphone Simulator Mockup */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl flex-1 flex flex-col overflow-hidden relative shadow-2xl min-h-[500px]">
            
            {/* Top ear speaker and lens indicator of phone */}
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-950 rounded-full z-20 flex items-center justify-center">
              <div className="w-8 h-1 bg-slate-800 rounded-full mr-2"></div>
              <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
            </div>

            {/* Simulated Chat header */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 pt-7 pb-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center text-white relative shadow-sm">
                  <User className="w-4 h-4" />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1">
                    {config.botName || "Miyabi"}
                    <span className="text-[9px] bg-rose-500/10 text-rose-400 px-1 py-0.2 rounded-full border border-rose-500/10">Bot</span>
                  </h3>
                  <span className="text-[10px] text-emerald-400">En ligne</span>
                </div>
              </div>

              {/* Header visual info */}
              <div className="text-[10px] text-slate-500 font-mono">
                Simulateur
              </div>
            </div>

            {/* Chat message space */}
            <div className="flex-1 bg-slate-950 p-4 overflow-y-auto space-y-3.5 flex flex-col relative">
              {/* Overlay note on chat simulator */}
              <div className="text-[9px] text-slate-500 bg-slate-900/30 border border-slate-800/50 px-2.5 py-1.5 rounded-xl text-center mb-1 leading-relaxed">
                🚀 Testez en direct la personnalité Tsundere de Miyabi configurée dans l'onglet de gauche.
              </div>

              <AnimatePresence initial={false}>
                {chatMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col max-w-[80%] ${msg.sender === "user" ? "self-end items-end" : "self-start items-start"}`}
                  >
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-rose-500 text-white rounded-tr-none"
                        : "bg-slate-800/80 text-slate-100 border border-slate-700/50 rounded-tl-none"
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 px-1 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing indicator */}
              {isTyping && (
                <div className="self-start max-w-[80%] flex flex-col items-start animate-pulse">
                  <div className="bg-slate-800/80 text-slate-300 border border-slate-700/50 p-3 rounded-2xl rounded-tl-none text-xs flex items-center gap-1.5">
                    <span className="font-semibold text-rose-400">{config.botName}</span> écrit
                    <div className="flex gap-0.5 mt-1">
                      <span className="w-1 h-1 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-1 h-1 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-1 h-1 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Prompt Ideas Row */}
            <div className="bg-slate-950 px-3 py-2 border-t border-slate-900 overflow-x-auto whitespace-nowrap flex gap-1.5 shrink-0 select-none scrollbar-none">
              <button 
                onClick={() => triggerSamplePrompt("Dis Baka !")}
                className="text-[10px] bg-slate-900 border border-slate-800/80 hover:bg-rose-950/20 hover:border-rose-900 hover:text-rose-400 px-2.5 py-1 rounded-full text-slate-400 transition"
              >
                Dis Baka !
              </button>
              <button 
                onClick={() => triggerSamplePrompt("Tu m'aimes, Miyabi ?")}
                className="text-[10px] bg-slate-900 border border-slate-800/80 hover:bg-rose-950/20 hover:border-rose-900 hover:text-rose-400 px-2.5 py-1 rounded-full text-slate-400 transition"
              >
                Tu m'aimes ?
              </button>
              <button 
                onClick={() => triggerSamplePrompt("Télécharge du son !")}
                className="text-[10px] bg-slate-900 border border-slate-800/80 hover:bg-rose-950/20 hover:border-rose-900 hover:text-rose-400 px-2.5 py-1 rounded-full text-slate-400 transition"
              >
                Commandes
              </button>
              <button 
                onClick={() => triggerSamplePrompt("Aide-moi à coder !")}
                className="text-[10px] bg-slate-900 border border-slate-800/80 hover:bg-rose-950/20 hover:border-rose-900 hover:text-rose-400 px-2.5 py-1 rounded-full text-slate-400 transition"
              >
                Aide-moi !
              </button>
            </div>

            {/* Simulated Chat input bar */}
            <form onSubmit={handleSendMessage} className="bg-slate-900 border-t border-slate-850 p-3 flex gap-2 shrink-0">
              <input 
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Écris à ${config.botName}...`}
                className="flex-1 bg-slate-950 border border-slate-800/80 rounded-2xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500/50 transition"
                disabled={isTyping}
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || isTyping}
                className="bg-rose-500 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-2xl w-9 h-9 flex items-center justify-center shrink-0 transition duration-150 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

      </main>

      {/* 4. BOTTOM PANEL: Live Server Log Stream (Full width) */}
      <footer className="border-t border-slate-900 bg-slate-950 p-4 md:p-6 flex flex-col gap-3 max-w-7xl w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-rose-400" />
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Console d'activité Miyabi Server
            </h2>
          </div>
          
          <button 
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-rose-400 transition font-semibold"
            title="Effacer la console"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Effacer
          </button>
        </div>

        {/* Live Logs Terminal view */}
        <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-3 h-32 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1.5 shadow-inner">
          {logs.map((log) => {
            let color = "text-slate-400";
            if (log.level === "success") color = "text-emerald-400";
            if (log.level === "warn") color = "text-amber-400 font-medium";
            if (log.level === "error") color = "text-rose-400 font-bold";
            return (
              <div key={log.id} className="flex items-start gap-2.5">
                <span className="text-slate-600 shrink-0 select-none">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                <span className={color}>{log.message}</span>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      </footer>
    </div>
  );
}
