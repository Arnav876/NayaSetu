import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, Volume2, VolumeX, Shield, AlertTriangle, CheckSquare, Clock } from 'lucide-react';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
  escalated?: boolean;
}

interface ChatbotProps {
  token: string;
  userId: string;
  userName?: string;
  isKiosk?: boolean;
  onSessionReset?: () => void;
  rehabProgramId?: string; // Optional program ID for voice attendance check-in
  undertrialId?: string; // Optional undertrial ID for attendance check-in
}

export const Chatbot: React.FC<ChatbotProps> = ({ 
  token, 
  userId, 
  userName,
  isKiosk = false, 
  onSessionReset,
  rehabProgramId,
  undertrialId
}) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [timeoutCounter, setTimeoutCounter] = useState(30); // 30s session timeout for Kiosk
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = language === 'hi' ? 'hi-IN' : 'en-IN';

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
        handleSend(transcript);
      };

      rec.onerror = (err: any) => {
        console.error('[Speech Recognition Error]', err);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, [language]);

  // Load persistent history strictly scoped to this authenticated userId
  useEffect(() => {
    // Immediately cancel any ongoing speech and clear existing messages to prevent session leakage
    window.speechSynthesis.cancel();
    setMessages([]);
    setQuery('');

    let isMounted = true;

    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/chat/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load history');
        const data = await res.json();

        if (isMounted) {
          if (Array.isArray(data) && data.length > 0) {
            setMessages(data.map((m: any) => ({
              sender: m.sender,
              text: m.text,
              timestamp: new Date(m.timestamp),
              escalated: m.escalated
            })));
          } else {
            // Welcome greeting for new session
            const welcome = language === 'hi'
              ? `नमस्ते${userName ? ` ${userName}` : ''}! मैं आपका न्यायसेतु सहायक हूँ। मैं आपकी सुनवाई, ज़मानत और वकील की जानकारी दे सकता हूँ।`
              : `Hello${userName ? ` ${userName}` : ''}! I am your NyayaSetu assistant. I can fetch your hearing dates, bail status, and lawyer info.`;
            setMessages([
              { sender: 'bot', text: welcome, timestamp: new Date() }
            ]);
          }
        }
      } catch (err) {
        if (isMounted) {
          const welcome = language === 'hi'
            ? `नमस्ते${userName ? ` ${userName}` : ''}! मैं आपका न्यायसेतु सहायक हूँ।`
            : `Hello${userName ? ` ${userName}` : ''}! I am your NyayaSetu assistant.`;
          setMessages([
            { sender: 'bot', text: welcome, timestamp: new Date() }
          ]);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
      window.speechSynthesis.cancel();
    };
  }, [userId, token, language]);

  // Inactivity timeout for shared Kiosk mode (Module 9)
  useEffect(() => {
    if (!isKiosk) return;

    const timer = setInterval(() => {
      setTimeoutCounter(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSessionReset();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isKiosk, messages]);

  const resetActivityTimer = () => {
    setTimeoutCounter(30);
  };

  const handleSessionReset = () => {
    setMessages([]);
    setQuery('');
    window.speechSynthesis.cancel();
    if (onSessionReset) {
      onSessionReset();
    }
  };

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Text to Speech
  const speakText = (text: string) => {
    if (!ttsEnabled) return;
    window.speechSynthesis.cancel(); // Stop any currently speaking speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    resetActivityTimer();
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        setIsListening(true);
        recognitionRef.current.start();
      } else {
        alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      }
    }
  };

  const handleSend = async (overrideQuery?: string) => {
    const textToSend = overrideQuery || query;
    if (!textToSend.trim()) return;

    resetActivityTimer();
    const newMsg: Message = { sender: 'user', text: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, newMsg]);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: textToSend, language })
      });

      const data = await response.json();
      const botMsg: Message = {
        sender: 'bot',
        text: data.text,
        timestamp: new Date(),
        escalated: data.escalated
      };

      setMessages(prev => [...prev, botMsg]);
      speakText(data.text);
    } catch (err) {
      console.error(err);
      const errorMsg: Message = {
        sender: 'bot',
        text: "Error connecting to the NyayaSetu assistant. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Voice Attendance Check-in Action (Module 9, 10)
  const triggerVoiceAttendanceCheckin = () => {
    resetActivityTimer();
    if (!rehabProgramId || !undertrialId) {
      alert("No active rehabilitation program found for check-in.");
      return;
    }

    const promptText = language === 'hi' 
      ? "कृपया माइक्रोफ़ोन चालू होने पर स्पष्ट रूप से बोलें: 'मैं कक्षा में हूँ और अपनी उपस्थिति की पुष्टि करता हूँ'"
      : "Please speak clearly once mic turns on: 'I confirm my attendance for vocational training today'";
    
    setMessages(prev => [
      ...prev,
      { sender: 'bot', text: promptText, timestamp: new Date() }
    ]);
    speakText(promptText);

    // Short timeout to let prompt read, then open mic
    setTimeout(() => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const voiceCheckInRec = new SpeechRecognition();
      voiceCheckInRec.lang = language === 'hi' ? 'hi-IN' : 'en-US';
      setIsListening(true);
      voiceCheckInRec.start();

      voiceCheckInRec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);

        // Append user transcript
        setMessages(prev => [
          ...prev,
          { sender: 'user', text: `Voice Check-in: "${transcript}"`, timestamp: new Date() }
        ]);

        try {
          const res = await fetch('/api/rehabilitation/attendance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              rehabilitationId: rehabProgramId,
              undertrialId: undertrialId,
              date: new Date().toISOString().split('T')[0],
              status: 'present',
              verificationMode: 'voice_check_in',
              voiceTranscript: transcript
            })
          });

          const resData = await res.json();
          if (resData.success) {
            const successMsg = language === 'hi'
              ? "आपकी आवाज आधारित उपस्थिति सफलतापूर्वक दर्ज हो गई है। धन्यवाद।"
              : "Voice attendance verified and recorded successfully in your rehabilitation log.";
            
            setMessages(prev => [
              ...prev,
              { sender: 'bot', text: successMsg, timestamp: new Date() }
            ]);
            speakText(successMsg);
          }
        } catch (err) {
          console.error(err);
        }
      };

      voiceCheckInRec.onerror = () => {
        setIsListening(false);
      };
    }, 4000);
  };

  return (
    <div className="glass-panel border-slate-800 flex flex-col h-[520px]">
      {/* Header bar */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Ask NyayaSetu (न्यायसेतु)</h3>
            <p className="text-[10px] text-slate-400">Scoped case fact responder • Secure connection</p>
          </div>
        </div>

        {/* Timeout Indicator & Lang switcher */}
        <div className="flex items-center gap-3">
          {isKiosk && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-xs">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Reset: {timeoutCounter}s</span>
            </div>
          )}

          <div className="flex rounded-lg bg-slate-850 p-0.5 border border-slate-750">
            <button
              onClick={() => { setLanguage('en'); resetActivityTimer(); }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${language === 'en' ? 'bg-primary-600 text-white' : 'text-slate-450 hover:text-slate-200'}`}
            >
              English
            </button>
            <button
              onClick={() => { setLanguage('hi'); resetActivityTimer(); }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${language === 'hi' ? 'bg-primary-600 text-white' : 'text-slate-450 hover:text-slate-200'}`}
            >
              हिन्दी
            </button>
          </div>

          <button
            onClick={() => { setTtsEnabled(!ttsEnabled); resetActivityTimer(); }}
            className={`p-1.5 rounded-lg border transition-all ${ttsEnabled ? 'border-primary-500/30 bg-primary-500/10 text-primary-400' : 'border-slate-800 text-slate-500'}`}
            title={ttsEnabled ? "Disable Text-To-Speech" : "Enable Text-To-Speech"}
          >
            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 no-scrollbar bg-slate-950/20">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-md transition-all ${
              msg.sender === 'user' 
                ? 'bg-primary-600/90 text-white rounded-tr-none border border-primary-500/40' 
                : msg.escalated 
                  ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-tl-none'
                  : 'bg-slate-900/95 text-slate-200 border border-slate-800 rounded-tl-none'
            }`}>
              {msg.escalated && (
                <div className="flex items-center gap-1 mb-1 text-[11px] text-rose-400 font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  <span>Escalated to Lawyer Visit Queue</span>
                </div>
              )}
              <div className="leading-relaxed">{msg.text}</div>
              <div className="text-[9px] text-slate-500 font-mono text-right mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-900/60 border border-slate-850 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm text-slate-400 shadow">
              <div className="flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Special Voice attendance triggers for Kiosk mode */}
      {isKiosk && rehabProgramId && (
        <div className="p-3 border-t border-slate-800 bg-slate-900/20 flex gap-2 justify-center">
          <button
            onClick={triggerVoiceAttendanceCheckin}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 text-white text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {language === 'hi' ? "आवाज द्वारा हाजिरी लगाएं" : "Register Attendance by Voice"}
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/20 flex items-center gap-2 rounded-b-2xl">
        <button
          onClick={toggleListening}
          className={`p-2.5 rounded-xl border transition-all active:scale-95 ${
            isListening 
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/40 animate-pulse' 
              : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title={isListening ? "Stop listening" : "Start speaking"}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); resetActivityTimer(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder={language === 'hi' ? "जमानत की स्थिति, सुनवाई की तारीख पूछें..." : "Ask about hearing dates, bail status, documents..."}
          className="flex-1 glass-input border-slate-850 focus:ring-primary-600/50 py-2.5 text-sm"
        />

        <button
          onClick={() => handleSend()}
          className="p-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 border border-primary-500/40 text-white font-bold transition-all active:scale-95"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
