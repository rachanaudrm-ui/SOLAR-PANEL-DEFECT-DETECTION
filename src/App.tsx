import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  BarChart3, 
  FileText, 
  Camera, 
  RefreshCcw,
  Zap,
  ShieldAlert,
  History,
  Download,
  ChevronRight,
  Info,
  MessageSquare,
  Map as MapIcon,
  Bell,
  Activity,
  TrendingDown,
  Send,
  User,
  Bot,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { analyzeSolarPanel } from './services/geminiService';
import { InspectionResult, DashboardStats, ChatMessage } from './types';
import { cn } from './lib/utils';
import { GoogleGenAI } from "@google/genai";

const COLORS = ['#38bdf8', '#10b981', '#fb923c', '#f43f5e', '#8b5cf6'];

export default function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<InspectionResult | null>(null);
  const [history, setHistory] = useState<InspectionResult[]>([]);
  const [view, setView] = useState<'upload' | 'result' | 'dashboard' | 'history' | 'report' | 'map' | 'chatbot'>('upload');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isDroneActive, setIsDroneActive] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [alerts, setAlerts] = useState<{id: string, message: string, type: 'critical' | 'warning'}[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('inspection_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('inspection_history', JSON.stringify(history));
  }, [history]);

  const saveResult = (result: InspectionResult) => {
    setHistory(prev => [result, ...prev]);
    
    // Check for severe defects to trigger alerts
    const severeDefects = result.defects.filter(d => d.severity === 'Severe');
    if (severeDefects.length > 0) {
      setAlerts(prev => [
        { 
          id: Math.random().toString(36).substr(2, 9), 
          message: `CRITICAL: ${severeDefects.length} severe defects detected in Panel ${result.id.slice(0, 4)}`,
          type: 'critical'
        },
        ...prev
      ]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setAnalysisProgress({ current: 0, total: files.length });
    setIsAnalyzing(true);
    setView('result');

    const results: InspectionResult[] = [];

    for (let i = 0; i < files.length; i++) {
      setAnalysisProgress(prev => ({ ...prev, current: i + 1 }));
      const file = files[i];
      
      try {
        const base64 = await fileToBase64(file);
        const resizedBase64 = await resizeImage(base64);
        const result = await analyzeSolarPanel(resizedBase64);
        results.push(result);
        if (i === 0) setCurrentResult(result);
      } catch (err: any) {
        console.error(`Failed to process file ${file.name}:`, err);
        setError(`Error processing ${file.name}: ${err.message}`);
        // Continue with other files if batch
      }
    }

    if (results.length > 0) {
      results.forEach(saveResult);
      if (results.length > 1) {
        // If batch, show the first one but maybe notify user
        setCurrentResult(results[0]);
      }
    }
    
    setIsAnalyzing(false);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied", err);
      alert("Could not access camera. Please check permissions.");
      setIsCameraOpen(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg');
      
      // Stop camera
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setIsCameraOpen(false);
      
      processImage(base64);
    }
  };

  const exportToCSV = () => {
    if (history.length === 0) return;

    const headers = ['ID', 'Timestamp', 'Status', 'Defect Count', 'Defect Types', 'Summary'];
    const rows = history.map(item => [
      item.id,
      new Date(item.timestamp).toLocaleString(),
      item.status,
      item.defects.length,
      item.defects.map(d => d.type).join('; '),
      item.summary.replace(/,/g, ';')
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `solar_inspection_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resizeImage = (base64: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Add crossOrigin for URL-based images (like in Drone Mode)
      if (base64.startsWith('http')) {
        img.crossOrigin = "anonymous";
      }
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (err) => reject(err);
    });
  };

  const processImage = async (base64: string) => {
    console.log("Starting analysis...");
    setIsAnalyzing(true);
    setAnalysisProgress({ current: 1, total: 1 });
    setError(null);
    setView('result');
    try {
      const resizedBase64 = await resizeImage(base64);
      const result = await analyzeSolarPanel(resizedBase64);
      console.log("Analysis complete:", result.status);
      setCurrentResult(result);
      saveResult(result);
    } catch (err: any) {
      console.error("Analysis failed in App.tsx:", err);
      setError(err.message || "Failed to analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getStats = (): DashboardStats => {
    const stats: DashboardStats = {
      totalInspected: history.length,
      defectiveCount: history.filter(h => h.status === 'Defective').length,
      defectTypes: {},
      averageHealthScore: history.length ? history.reduce((acc, h) => acc + (h.healthScore || 0), 0) / history.length : 0,
      totalEfficiencyLoss: history.reduce((acc, h) => acc + (h.efficiencyLoss || 0), 0)
    };

    history.forEach(h => {
      h.defects.forEach(d => {
        stats.defectTypes[d.type] = (stats.defectTypes[d.type] || 0) + 1;
      });
    });

    return stats;
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });
      
      const context = history.length > 0 
        ? `Current system status: ${history.length} panels inspected. ${history.filter(h => h.status === 'Defective').length} defective. Recent defects: ${history.slice(0, 3).map(h => h.defects.map(d => d.type).join(', ')).join('; ')}.`
        : "No inspection data available yet.";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: `You are SolarScan AI Assistant. Help the user with solar panel maintenance and inspection queries. ${context}` },
              ...chatMessages.map(m => ({ text: `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}` })),
              { text: `User: ${chatInput}` }
            ]
          }
        ]
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.text || "I'm sorry, I couldn't process that request.",
        timestamp: new Date().toISOString()
      };

      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const stats = getStats();

  const chartData = Object.entries(stats.defectTypes).map(([name, value]) => ({ name, value }));
  const statusData = [
    { name: 'Healthy', value: stats.totalInspected - stats.defectiveCount },
    { name: 'Defective', value: stats.defectiveCount }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-brand-bg/50 backdrop-blur-md sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setView('upload')}>
              <div className="relative">
                <Zap className="w-8 h-8 text-sky-400 fill-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)] group-hover:scale-110 transition-transform" />
                <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
              </div>
              <span className="font-black text-xl tracking-tighter uppercase bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent animate-gradient">SolarScan AI</span>
            </div>
            <div className="flex gap-1 items-center">
              <div className="relative mr-2 no-print">
                <button 
                  onClick={() => setAlerts([])}
                  className="p-2 rounded-full hover:bg-white/5 transition-all relative"
                >
                  <Bell className="w-5 h-5 text-brand-text/60" />
                  {alerts.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                  )}
                </button>
                <AnimatePresence>
                  {alerts.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-64 bg-brand-card rounded-2xl shadow-2xl border border-white/10 p-4 z-[60]"
                    >
                      <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2 opacity-40">Active Alerts</h4>
                      <div className="space-y-2">
                        {alerts.map(alert => (
                          <div key={alert.id} className={cn(
                            "p-2 rounded-lg text-[10px] font-medium",
                            alert.type === 'critical' ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
                          )}>
                            {alert.message}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {[
                { id: 'upload', icon: Upload, label: 'Scan', color: 'text-sky-400', glow: 'shadow-sky-400/20' },
                { id: 'dashboard', icon: BarChart3, label: 'Stats', color: 'text-emerald-400', glow: 'shadow-emerald-400/20' },
                { id: 'map', icon: MapIcon, label: 'Farm Map', color: 'text-amber-400', glow: 'shadow-amber-400/20' },
                { id: 'history', icon: History, label: 'History', color: 'text-indigo-400', glow: 'shadow-indigo-400/20' },
                { id: 'chatbot', icon: MessageSquare, label: 'AI Assistant', color: 'text-fuchsia-400', glow: 'shadow-fuchsia-400/20' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                    view === item.id 
                      ? "bg-gradient-to-r from-sky-500 to-emerald-500 text-brand-bg shadow-lg shadow-sky-500/20" 
                      : "text-brand-text/60 hover:bg-white/5"
                  )}
                >
                  <item.icon className={cn(
                    "w-4 h-4 transition-all", 
                    view === item.id ? "text-brand-bg" : item.color,
                    view !== item.id && "drop-shadow-[0_0_8px_rgba(var(--color-rgb),0.5)]"
                  )} />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-indigo-500/20 via-cyan-500/20 to-emerald-500/20" />
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {view === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto text-center space-y-8 py-12"
            >
              <div className="space-y-4">
                <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-none uppercase">
                  DETECT DEFECTS <br />
                  <span className="bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 bg-clip-text text-transparent animate-gradient">IN SECONDS.</span>
                </h1>
                <p className="text-brand-muted text-lg max-w-md mx-auto font-medium">
                  Advanced computer vision for solar farm maintenance and efficiency optimization.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative cursor-pointer flex-1 max-w-sm"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-sky-400 to-emerald-400 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative bg-brand-card border-2 border-dashed border-white/10 rounded-3xl p-8 transition-all group-hover:border-sky-400/50 group-hover:bg-sky-400/5 h-full">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-sky-400/10 rounded-full flex items-center justify-center text-sky-400">
                        <Upload className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="text-lg font-bold uppercase tracking-tight text-brand-text">Upload Images</p>
                        <p className="text-brand-muted text-[10px] font-bold uppercase tracking-widest">Supports batch selection</p>
                      </div>
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    multiple
                    onChange={handleFileUpload}
                  />
                </div>

                <div 
                  onClick={startCamera}
                  className="group relative cursor-pointer flex-1 max-w-sm"
                >
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative bg-brand-card border-2 border-dashed border-white/10 rounded-3xl p-8 transition-all group-hover:border-indigo-500/50 group-hover:bg-indigo-500/5 h-full">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center text-indigo-400">
                        <Camera className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="text-lg font-bold uppercase tracking-tight text-brand-text">Use Camera</p>
                        <p className="text-brand-muted text-[10px] font-bold uppercase tracking-widest">Capture live inspection</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={() => {
                    if (isDroneActive) return;
                    setIsDroneActive(true);
                    setAlerts(prev => [
                      { 
                        id: Math.random().toString(36).substr(2, 9), 
                        message: "Drone Inspection Mode Activated. Connecting to SolarScan Drone-V2...",
                        type: 'warning'
                      },
                      ...prev
                    ]);
                    // Simulate drone capture
                    setTimeout(() => {
                      processImage("https://picsum.photos/seed/solar-drone/1024/1024")
                        .finally(() => setIsDroneActive(false));
                    }, 3000);
                  }}
                  className={cn(
                    "group relative cursor-pointer flex-1 max-w-sm transition-all duration-500",
                    isDroneActive && "scale-95 opacity-80"
                  )}
                >
                  <div className={cn(
                    "absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200",
                    isDroneActive && "opacity-100 animate-pulse"
                  )}></div>
                  <div className={cn(
                    "relative bg-brand-card border-2 border-dashed border-white/10 rounded-3xl p-8 transition-all group-hover:border-amber-400/50 group-hover:bg-amber-400/5 h-full",
                    isDroneActive && "border-amber-400 bg-amber-400/10"
                  )}>
                    <div className="flex flex-col items-center gap-4">
                      <div className={cn(
                        "w-16 h-16 bg-amber-400/10 rounded-full flex items-center justify-center text-amber-400",
                        isDroneActive && "animate-bounce"
                      )}>
                        <RefreshCcw className={cn("w-8 h-8", isDroneActive ? "animate-spin" : "animate-spin-slow")} />
                      </div>
                      <div>
                        <p className="text-lg font-bold uppercase tracking-tight text-brand-text">
                          {isDroneActive ? "Drone Scanning..." : "Drone Mode"}
                        </p>
                        <p className="text-brand-muted text-[10px] font-bold uppercase tracking-widest">
                          {isDroneActive ? "Receiving Telemetry" : "Automated Farm Scan"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isCameraOpen && (
                <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col items-center justify-center p-4">
                  <div className="relative w-full max-w-2xl aspect-video bg-black rounded-3xl overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
                      <button 
                        onClick={() => {
                          const stream = videoRef.current?.srcObject as MediaStream;
                          stream?.getTracks().forEach(t => t.stop());
                          setIsCameraOpen(false);
                        }}
                        className="px-8 py-3 bg-white/20 backdrop-blur-md text-white rounded-full font-bold uppercase text-xs tracking-widest"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={capturePhoto}
                        className="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center text-brand-bg shadow-2xl"
                      >
                        <Camera className="w-8 h-8" />
                      </button>
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8">
                {[
                  { label: 'Cracks', icon: ShieldAlert, color: 'text-red-400' },
                  { label: 'Hotspots', icon: Zap, color: 'text-brand-accent' },
                  { label: 'Dust', icon: Info, color: 'text-brand-primary' },
                  { label: 'Burn Marks', icon: AlertTriangle, color: 'text-orange-600' }
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <item.icon className={cn("w-5 h-5", item.color)} />
                    <span className="text-xs font-bold uppercase tracking-widest text-brand-text/60">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Image View */}
              <div className="lg:col-span-2 space-y-6">
                <div className="relative rounded-3xl overflow-hidden bg-brand-bg shadow-2xl aspect-video flex items-center justify-center">
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center gap-6 text-white p-8 text-center">
                      <div className="relative">
                        <RefreshCcw className="w-16 h-16 animate-spin text-brand-primary" />
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-brand-primary">
                          {analysisProgress.current}/{analysisProgress.total}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="font-mono text-sm tracking-widest uppercase animate-pulse text-brand-primary">
                          {analysisProgress.total > 1 ? `Processing Batch: ${analysisProgress.current} of ${analysisProgress.total}` : 'Analyzing Photovoltaic Cells...'}
                        </p>
                        <div className="w-48 h-1 bg-brand-primary/10 rounded-full overflow-hidden mx-auto">
                          <motion.div 
                            className="h-full bg-brand-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-6 p-12 text-center glass-card border-brand-accent/20 bg-brand-accent/5">
                      <div className="w-20 h-20 bg-brand-accent/10 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-10 h-10 text-brand-accent" />
                      </div>
                      <div className="space-y-3">
                        <h3 className="font-black text-2xl uppercase tracking-tight text-brand-text">Analysis Failed</h3>
                        <p className="text-brand-muted text-sm max-w-md leading-relaxed">{error}</p>
                      </div>
                      <button 
                        onClick={() => setView('upload')}
                        className="btn-primary bg-brand-accent hover:bg-brand-accent/90"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : currentResult ? (
                    <>
                      <img 
                        src={currentResult.imageUrl} 
                        alt="Inspected Panel" 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                      {/* Bounding Boxes */}
                      {currentResult.defects.map((defect, idx) => {
                        const [ymin, xmin, ymax, xmax] = defect.box_2d;
                        return (
                            <div
                              key={idx}
                              className="absolute border-2 border-brand-accent shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                              style={{
                                top: `${ymin / 10}%`,
                                left: `${xmin / 10}%`,
                                width: `${(xmax - xmin) / 10}%`,
                                height: `${(ymax - ymin) / 10}%`
                              }}
                            >
                              <span className="absolute -top-6 left-0 bg-brand-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap">
                                {defect.type} ({(defect.confidence * 100).toFixed(0)}%)
                              </span>
                            </div>
                        );
                      })}
                    </>
                  ) : null}
                </div>

                {currentResult && !isAnalyzing && !error && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="glass-card p-6 space-y-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-brand-secondary" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-text/40">Health Score</h3>
                      </div>
                      <p className="text-3xl font-black text-brand-secondary">{currentResult.healthScore}%</p>
                    </div>
                    <div className="glass-card p-6 space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-brand-accent" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-text/40">Efficiency Loss</h3>
                      </div>
                      <p className="text-3xl font-black text-brand-accent">{currentResult.efficiencyLoss}%</p>
                    </div>
                    <div className="glass-card p-6 space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-brand-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-text/40">Energy Loss</h3>
                      </div>
                      <p className="text-3xl font-black text-brand-text">{currentResult.estimatedEnergyLoss} <span className="text-sm font-bold">kWh/d</span></p>
                    </div>
                  </div>
                )}

                {currentResult && !isAnalyzing && !error && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="glass-card p-6 space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-brand-text/40">Summary</h3>
                      <p className="text-lg font-medium leading-tight">{currentResult.summary}</p>
                    </div>
                    <div className="glass-card p-6 space-y-2 border-brand-accent/20 bg-brand-accent/5">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-brand-accent">Recommendation</h3>
                      <p className="text-lg font-medium leading-tight">{currentResult.maintenanceRecommendation}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar Info */}
              <div className="space-y-6">
                <div className={cn(
                  "p-8 rounded-3xl flex flex-col items-center text-center gap-4",
                  isAnalyzing ? "bg-brand-primary text-brand-bg" :
                  error ? "bg-red-600 text-white" :
                  currentResult?.status === 'Healthy' ? "bg-green-500 text-white" : "bg-brand-primary text-brand-bg"
                )}>
                  {isAnalyzing ? (
                    <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                  ) : error ? (
                    <ShieldAlert className="w-20 h-20" />
                  ) : currentResult?.status === 'Healthy' ? (
                    <CheckCircle2 className="w-20 h-20" />
                  ) : (
                    <AlertTriangle className="w-20 h-20 text-brand-accent" />
                  )}
                  <div>
                    <h2 className="text-4xl font-black uppercase tracking-tighter">
                      {isAnalyzing ? 'Scanning...' : error ? 'FAILED' : currentResult?.status}
                    </h2>
                    <p className="opacity-70 text-sm font-mono uppercase tracking-widest">
                      {isAnalyzing ? 'Processing Frame' : error ? 'System Error' : 'Inspection Status'}
                    </p>
                  </div>
                </div>

                {!isAnalyzing && !error && currentResult && (
                  <div className="glass-card p-6 space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold uppercase tracking-widest text-xs">Detected Defects</h3>
                      <span className="bg-brand-primary text-brand-bg text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {currentResult.defects.length} FOUND
                      </span>
                    </div>

                    <div className="space-y-3">
                      {currentResult.defects.length === 0 ? (
                        <div className="py-8 text-center text-brand-text/40">
                          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">No defects detected in this panel.</p>
                        </div>
                      ) : (
                        currentResult.defects.map((defect, idx) => (
                          <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm uppercase text-brand-text">{defect.type}</span>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                                  defect.severity === 'Severe' ? "bg-red-500/20 text-red-400" :
                                  defect.severity === 'Moderate' ? "bg-brand-accent/20 text-brand-accent" :
                                  "bg-blue-500/20 text-blue-400"
                                )}>
                                  {defect.severity}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono opacity-50 text-brand-text">CONF: {(defect.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <p className="text-xs text-brand-text/60 leading-relaxed">{defect.description}</p>
                            <div className="pt-2 border-t border-white/5">
                              <p className="text-[10px] font-bold uppercase text-brand-accent">Recommendation:</p>
                              <p className="text-xs font-medium text-brand-text">{defect.recommendation}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <button 
                      onClick={() => setView('report')}
                      className="w-full py-4 bg-brand-primary text-brand-bg rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      View Full Report
                    </button>
                    
                    <button 
                      onClick={() => setView('upload')}
                      className="w-full py-4 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-brand-text"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      New Inspection
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'report' && currentResult && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex justify-between items-center no-print">
                <button 
                  onClick={() => setView('result')}
                  className="px-6 py-2 border border-white/10 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-white/5 transition-colors flex items-center gap-2 text-brand-text"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Back to Result
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-6 py-2 bg-brand-primary text-brand-bg rounded-full font-bold uppercase text-xs tracking-widest hover:bg-brand-primary/90 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Print PDF
                </button>
              </div>

              <div className="glass-card p-12 space-y-12 bg-brand-card shadow-2xl print:shadow-none print:border-none">
                <div className="flex justify-between items-start border-b-4 border-brand-text pb-8">
                  <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter text-brand-text">Maintenance Report</h1>
                    <p className="font-mono text-sm opacity-60 text-brand-text">ID: {currentResult.id}</p>
                    <p className="font-mono text-sm opacity-60 text-brand-text">DATE: {new Date(currentResult.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <Zap className="w-12 h-12 text-brand-primary ml-auto" />
                    <p className="font-bold uppercase tracking-widest text-xs mt-2 text-brand-text">SolarScan AI</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-widest opacity-40 text-brand-text">Inspection View</h2>
                    <div className="border-2 border-brand-text rounded-3xl overflow-hidden aspect-video bg-brand-bg relative">
                      <img 
                        src={currentResult.imageUrl} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                      {currentResult.defects.map((defect, idx) => {
                        const [ymin, xmin, ymax, xmax] = defect.box_2d;
                        return (
                          <div
                            key={idx}
                            className="absolute border-2 border-brand-accent"
                            style={{
                              top: `${ymin / 10}%`,
                              left: `${xmin / 10}%`,
                              width: `${(xmax - xmin) / 10}%`,
                              height: `${(ymax - ymin) / 10}%`
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-brand-text">Health Score</h2>
                        <p className="text-4xl font-black text-brand-secondary">{currentResult.healthScore}%</p>
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-brand-text">Efficiency Loss</h2>
                        <p className="text-4xl font-black text-brand-accent">{currentResult.efficiencyLoss}%</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xs font-bold uppercase tracking-widest opacity-40 text-brand-text">Status</h2>
                      <p className={cn(
                        "text-5xl font-black uppercase tracking-tighter",
                        currentResult.status === 'Healthy' ? "text-brand-secondary" : "text-brand-accent"
                      )}>
                        {currentResult.status}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xs font-bold uppercase tracking-widest opacity-40 text-brand-text">Summary</h2>
                      <p className="text-lg leading-tight font-medium text-brand-text">{currentResult.summary}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest opacity-40 text-brand-text">Detected Anomalies</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-brand-text">
                          <th className="py-4 text-xs font-bold uppercase tracking-widest text-brand-text">Type</th>
                          <th className="py-4 text-xs font-bold uppercase tracking-widest text-brand-text">Severity</th>
                          <th className="py-4 text-xs font-bold uppercase tracking-widest text-brand-text">Confidence</th>
                          <th className="py-4 text-xs font-bold uppercase tracking-widest text-brand-text">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {currentResult.defects.map((d, i) => (
                          <tr key={i}>
                            <td className="py-4 font-bold uppercase text-sm text-brand-text">{d.type}</td>
                            <td className="py-4">
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                                d.severity === 'Severe' ? "bg-red-500/20 text-red-400" :
                                d.severity === 'Moderate' ? "bg-brand-accent/20 text-brand-accent" :
                                "bg-blue-500/20 text-blue-400"
                              )}>
                                {d.severity}
                              </span>
                            </td>
                            <td className="py-4 font-mono text-sm text-brand-text">{(d.confidence * 100).toFixed(0)}%</td>
                            <td className="py-4 text-sm opacity-70 text-brand-text">{d.description}</td>
                          </tr>
                        ))}
                        {currentResult.defects.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-8 text-center opacity-40 italic text-brand-text">No defects identified in this inspection.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-8 bg-white/5 rounded-3xl space-y-2 border border-white/10">
                  <h2 className="text-xs font-bold uppercase tracking-widest opacity-40 text-brand-text">Maintenance Recommendation</h2>
                  <p className="text-xl font-bold leading-tight text-brand-text">{currentResult.maintenanceRecommendation}</p>
                </div>

                <div className="pt-12 border-t border-white/10 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-brand-text">This report was automatically generated by SolarScan AI Computer Vision System.</p>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'map' && (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">SOLAR FARM MAP</h2>
                  <p className="text-brand-dark/60 uppercase text-xs font-bold tracking-widest">Real-time panel status visualization</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-[10px] font-bold uppercase opacity-60">Healthy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-brand-accent" />
                    <span className="text-[10px] font-bold uppercase opacity-60">Defective</span>
                  </div>
                </div>
              </div>

              <div className="glass-card p-8 aspect-video relative overflow-hidden bg-brand-gray/30">
                <div className="grid grid-cols-10 gap-2 h-full">
                  {Array.from({ length: 50 }).map((_, i) => {
                    // Simulate panel status based on history or random
                    const isDefective = i % 7 === 0;
                    return (
                      <motion.div
                        key={i}
                        whileHover={{ scale: 1.1, zIndex: 10 }}
                        className={cn(
                          "rounded-md border-2 transition-all cursor-pointer flex items-center justify-center",
                          isDefective ? "bg-brand-accent/20 border-brand-accent" : "bg-green-500/20 border-green-500"
                        )}
                      >
                        <Zap className={cn("w-4 h-4", isDefective ? "text-brand-accent" : "text-green-500")} />
                      </motion.div>
                    );
                  })}
                </div>
                <div className="absolute inset-0 pointer-events-none border-4 border-brand-dark/5 rounded-3xl" />
              </div>
            </motion.div>
          )}

          {view === 'chatbot' && (
            <motion.div
              key="chatbot"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto h-[70vh] flex flex-col glass-card overflow-hidden"
            >
                <div className="p-6 border-b border-white/10 bg-brand-bg/80 backdrop-blur-md text-brand-text flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 flex items-center justify-center border border-fuchsia-500/30 shadow-lg shadow-fuchsia-500/10">
                      <Bot className="w-6 h-6 text-fuchsia-400" />
                    </div>
                    <div>
                      <h3 className="font-black uppercase tracking-widest text-sm text-brand-text">SolarScan AI Assistant</h3>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">System Online</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setChatMessages([])} className="p-2 rounded-xl hover:bg-white/5 transition-all text-brand-text/40 hover:text-brand-text">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <MessageSquare className="w-12 h-12 text-brand-primary" />
                    <p className="text-sm max-w-xs text-brand-text">Ask me anything about your solar panel health, maintenance tips, or defect analysis.</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                    <div key={idx} className={cn(
                      "flex gap-3 max-w-[80%]",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border",
                        msg.role === 'user' 
                          ? "bg-sky-500/20 text-sky-400 border-sky-500/30" 
                          : "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30"
                      )}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={cn(
                        "p-4 rounded-2xl text-sm shadow-xl transition-all",
                        msg.role === 'user' 
                          ? "bg-gradient-to-br from-sky-500 to-indigo-600 text-white rounded-tr-none" 
                          : "bg-white/5 text-brand-text rounded-tl-none border border-white/10 backdrop-blur-sm"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                ))}
                {isChatLoading && (
                  <div className="flex gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 rounded-tl-none flex gap-1 border border-white/10">
                      <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleChat} className="p-6 border-t border-white/10 bg-brand-bg/50">
                <div className="relative">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about maintenance recommendations..."
                    className="w-full pl-6 pr-16 py-4 bg-white/5 rounded-2xl border border-white/10 focus:ring-2 focus:ring-brand-primary transition-all outline-none text-brand-text placeholder:text-brand-text/30"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isChatLoading}
                    className="absolute right-2 top-2 bottom-2 px-4 bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white rounded-xl hover:scale-105 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-fuchsia-500/20"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: 'Total Inspected', value: stats.totalInspected, icon: History, color: 'text-sky-400', bg: 'bg-sky-400/10' },
                  { label: 'Defective Panels', value: stats.defectiveCount, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10' },
                  { label: 'Avg Health Score', value: `${stats.averageHealthScore.toFixed(1)}%`, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                  { label: 'Total Efficiency Loss', value: `${stats.totalEfficiencyLoss.toFixed(1)}%`, icon: TrendingDown, color: 'text-rose-400', bg: 'bg-rose-400/10' }
                ].map((item) => (
                  <div key={item.label} className="glass-card p-6 flex items-center gap-4 group">
                    <div className={cn("p-3 rounded-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3", item.bg, item.color)}>
                      <item.icon className="w-6 h-6 drop-shadow-[0_0_8px_currentColor]" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-text/40">{item.label}</p>
                      <p className="text-2xl font-black tracking-tighter text-brand-text">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-card p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold uppercase tracking-widest text-xs text-brand-text">Efficiency Loss Trend</h3>
                    <TrendingDown className="w-4 h-4 text-brand-accent" />
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history.slice().reverse().map((h, i) => ({ name: i + 1, loss: h.efficiencyLoss }))}>
                        <defs>
                          <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff20', borderRadius: '12px' }} />
                        <Area type="monotone" dataKey="loss" stroke="#f43f5e" fillOpacity={1} fill="url(#colorLoss)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card p-8 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold uppercase tracking-widest text-xs text-brand-text">Health Score History</h3>
                    <Activity className="w-4 h-4 text-brand-secondary" />
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history.slice().reverse().map((h, i) => ({ name: i + 1, score: h.healthScore }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff20', borderRadius: '12px' }} />
                        <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-card p-8 space-y-6">
                  <h3 className="font-bold uppercase tracking-widest text-xs text-brand-text">Defect Distribution</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff20', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                        />
                        <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card p-8 space-y-6">
                  <h3 className="font-bold uppercase tracking-widest text-xs text-brand-text">Overall Health Status</h3>
                  <div className="h-[300px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff20', borderRadius: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-8">
                    {statusData.map((item, idx) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx] }} />
                        <span className="text-xs font-bold uppercase tracking-widest opacity-60">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card overflow-hidden"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-bold uppercase tracking-widest text-xs text-brand-text">Inspection History</h3>
                <div className="flex gap-4">
                  <button 
                    onClick={exportToCSV}
                    className="text-[10px] font-bold uppercase tracking-widest text-brand-text/60 hover:text-brand-text flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Export CSV
                  </button>
                  <button 
                    onClick={() => {
                      if(confirm('Clear all history?')) setHistory([]);
                    }}
                    className="text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-brand-text"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="divide-y divide-white/10">
                {history.length === 0 ? (
                  <div className="p-20 text-center text-brand-text/40">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-10 text-brand-primary" />
                    <p>No inspection records found.</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id} 
                      className="data-row px-8 flex items-center justify-between"
                      onClick={() => {
                        setCurrentResult(item);
                        setView('result');
                      }}
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-brand-bg flex-shrink-0">
                          <img 
                            src={item.imageUrl} 
                            alt="Panel" 
                            className="w-full h-full object-cover opacity-80" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <p className="font-bold uppercase text-sm tracking-tight text-brand-text">{item.status}</p>
                          <p className="text-xs text-brand-text/50 font-mono">{new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="hidden sm:block text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-text/40">Defects</p>
                          <p className="font-bold text-brand-text">{item.defects.length}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-brand-primary/40" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 bg-brand-bg/30 no-print">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-4">
          <div className="flex justify-center gap-4">
            <Zap className="w-5 h-5 text-brand-primary opacity-50" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-text/40">
            SolarScan AI &copy; 2026 Industrial Maintenance Systems
          </p>
        </div>
      </footer>
    </div>
  );
}
