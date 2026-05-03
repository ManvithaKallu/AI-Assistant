import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000";

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [documentName, setDocumentName] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [mode, setMode] = useState("chat");
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [spokenQuestion, setSpokenQuestion] = useState("");

  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiPaused, setIsAiPaused] = useState(false);

  const [summaryText, setSummaryText] = useState("");
  const [summaryTitle, setSummaryTitle] = useState("");
  const [isSummaryPlaying, setIsSummaryPlaying] = useState(false);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const speechBufferRef = useRef("");
  const pendingSpeechRef = useRef(0);
  const streamFinishedRef = useRef(false);
  const askInFlightRef = useRef(false);
  const submittingTalkRef = useRef(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const fetchDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/documents`, {
        headers: { "x-session-id": "default" },
      });
      setUploadedDocuments(res.data.documents || []);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    setIsListening(false);
  };

  const stopAllSpeech = () => {
    window.speechSynthesis.cancel();
    pendingSpeechRef.current = 0;
    speechBufferRef.current = "";
    streamFinishedRef.current = true;
    setIsAiSpeaking(false);
    setIsAiPaused(false);
    setIsSummaryPlaying(false);
  };

  const switchMode = (nextMode) => {
    stopListening();
    stopAllSpeech();
    setMode(nextMode);
    setLiveTranscript("");
    setSpokenQuestion("");
    finalTranscriptRef.current = "";
    submittingTalkRef.current = false;
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setSelectedFiles(files);
    setUploadStatus("");
    setDocumentName(
      files.length === 1 ? files[0].name : `${files.length} documents selected`
    );
  };

  const uploadDocument = async () => {
    if (!selectedFiles.length) {
      setUploadStatus("Please select one or more files first.");
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Uploading 0/${selectedFiles.length} documents...`);

    let success = 0;
    let chunks = 0;
    const summaries = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadStatus(`Indexing ${i + 1}/${selectedFiles.length}: ${file.name}`);

        const formData = new FormData();
        formData.append("file", file);

        const res = await axios.post(`${API_BASE_URL}/upload`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
            "x-session-id": "default",
          },
        });

        success += 1;
        chunks += res.data.total_chunks || 0;

        if (res.data.summary) {
          summaries.push({
            filename: res.data.filename,
            summary: res.data.summary,
          });
        }
      }

      setUploadStatus(`✅ ${success} document(s) ready · ${chunks} chunks indexed`);

      if (summaries.length === 1) {
        setSummaryTitle(summaries[0].filename);
        setSummaryText(summaries[0].summary);
      } else if (summaries.length > 1) {
        setSummaryTitle(`${summaries.length} document summaries`);
        setSummaryText(
          summaries.map((s) => `${s.filename}: ${s.summary}`).join(" ")
        );
      }

      setSelectedFiles([]);
      setDocumentName("");
      await fetchDocuments();
    } catch (err) {
      console.error(err);
      setUploadStatus("Upload failed. Check backend logs.");
    } finally {
      setIsUploading(false);
    }
  };

  const clearDocuments = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/documents`, {
        headers: { "x-session-id": "default" },
      });
    } catch {}

    stopListening();
    stopAllSpeech();

    setUploadedDocuments([]);
    setSelectedFiles([]);
    setMessages([]);
    setDocumentName("");
    setUploadStatus("Documents cleared.");
    setSummaryText("");
    setSummaryTitle("");
    setLiveTranscript("");
    setSpokenQuestion("");
    finalTranscriptRef.current = "";
  };

  const playSummary = () => {
    if (!summaryText) return;

    stopAllSpeech();

    const utterance = new SpeechSynthesisUtterance(summaryText);
    utterance.rate = 0.95;

    utterance.onstart = () => setIsSummaryPlaying(true);
    utterance.onend = () => setIsSummaryPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  const pauseSpeech = () => {
    window.speechSynthesis.pause();
    setIsAiPaused(true);
  };

  const resumeSpeech = () => {
    window.speechSynthesis.resume();
    setIsAiPaused(false);
  };

  const speakChunk = (text) => {
    const clean = text.replace(/\[.*?\]/g, "").trim();
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;

    pendingSpeechRef.current += 1;
    setIsAiSpeaking(true);
    setIsAiPaused(false);

    utterance.onend = () => {
      pendingSpeechRef.current -= 1;
      if (pendingSpeechRef.current <= 0 && streamFinishedRef.current) {
        setIsAiSpeaking(false);
        setIsAiPaused(false);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition works best in Chrome.");
      return;
    }

    stopAllSpeech();

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    finalTranscriptRef.current = "";
    submittingTalkRef.current = false;

    recognition.onstart = () => {
      setIsListening(true);
      setLiveTranscript("");
      setSpokenQuestion("");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interimText += transcript + " ";
        }
      }

      finalTranscriptRef.current = finalText.trim();
      setLiveTranscript((finalText + interimText).trim());
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const submitTalkQuestion = () => {
    if (submittingTalkRef.current) return;

    const finalQuestion = (liveTranscript || finalTranscriptRef.current).trim();
    if (!finalQuestion) return;

    submittingTalkRef.current = true;

    stopListening();

    setSpokenQuestion(finalQuestion);
    setLiveTranscript("");
    finalTranscriptRef.current = "";

    askQuestion(finalQuestion, true);
  };

  const askQuestion = async (overrideQuestion = null, shouldSpeak = false) => {
    const userQuestion = (overrideQuestion || question).trim();

    if (!userQuestion || askInFlightRef.current) return;

    askInFlightRef.current = true;
    setIsThinking(true);
    setLastQuestion(userQuestion);

    setMessages((prev) => [
      ...prev,
      { role: "user", text: userQuestion },
      { role: "assistant", text: "", sources: [] },
    ]);

    setQuestion("");

    speechBufferRef.current = "";
    streamFinishedRef.current = false;

    if (shouldSpeak || mode === "talk") {
      stopAllSpeech();
    }

    try {
      const res = await fetch(`${API_BASE_URL}/ask/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": "default",
        },
        body: JSON.stringify({ question: userQuestion }),
      });

      if (!res.ok || !res.body) throw new Error("Streaming failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const rawEvent of events) {
          let currentEvent = "";
          let rawData = "";

          const lines = rawEvent.split("\n");

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.replace("event:", "").trim();
            }

            if (line.startsWith("data:")) {
              rawData += line.replace("data:", "").trim();
            }
          }

          if (!currentEvent || !rawData) continue;

          if (currentEvent === "sources") {
            const sources = JSON.parse(rawData);

            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                sources,
              };
              return updated;
            });
          }

          if (currentEvent === "token") {
            const token = JSON.parse(rawData);

            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                text: updated[updated.length - 1].text + token,
              };
              return updated;
            });

            if (shouldSpeak || mode === "talk") {
              speechBufferRef.current += token;

              const shouldSpeakNow =
                /[.!?]\s*$/.test(speechBufferRef.current) ||
                speechBufferRef.current.length > 180;

              if (shouldSpeakNow) {
                speakChunk(speechBufferRef.current);
                speechBufferRef.current = "";
              }
            }
          }

          if (currentEvent === "done") {
            streamFinishedRef.current = true;

            if ((shouldSpeak || mode === "talk") && speechBufferRef.current.trim()) {
              speakChunk(speechBufferRef.current);
              speechBufferRef.current = "";
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          text: "Backend streaming error. Check FastAPI or Ollama.",
          sources: [],
        };
        return updated;
      });
    } finally {
      askInFlightRef.current = false;
      submittingTalkRef.current = false;
      setIsThinking(false);
    }
  };

  const handleEnter = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  const getSourceText = (source) => {
    if (typeof source === "string") return source;
    return source?.text || "";
  };

  const highlightSource = (text, query) => {
    if (!query) return text;

    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    if (!words.length) return text;

    const regex = new RegExp(`(${words.join("|")})`, "gi");

    return text.replace(
      regex,
      `<mark class="bg-yellow-300/30 text-yellow-100 rounded px-1">$1</mark>`
    );
  };

  return (
    <div className="fixed inset-0 bg-[#020617] text-white overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="water-motion absolute -inset-40 bg-[radial-gradient(circle_at_20%_25%,rgba(59,130,246,0.55),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.45),transparent_28%),radial-gradient(circle_at_55%_75%,rgba(6,182,212,0.45),transparent_32%),radial-gradient(circle_at_20%_90%,rgba(168,85,247,0.35),transparent_30%)] blur-3xl" />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      <div className="relative z-20 h-full w-full p-3">
        <div className="flex h-full w-full gap-3">
          <aside className="w-[300px] shrink-0 rounded-[28px] border border-white/15 bg-white/[0.08] backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 flex items-center justify-center font-black shadow-lg shadow-blue-500/30">
                  AI
                </div>
                <div>
                  <h1 className="text-xl font-black">AI Assistant</h1>
                  <p className="text-xs text-slate-300">
                    Private document intelligence
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="rounded-3xl bg-white/[0.08] border border-white/15 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-4">
                  Upload Documents
                </p>

                <label className="block cursor-pointer rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-300/[0.06] p-5 text-center hover:bg-cyan-300/[0.1] transition">
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-2xl">
                    ☁️
                  </div>

                  <p className="text-sm font-semibold break-words">
                    {isUploading
                      ? "Indexing documents..."
                      : uploadedDocuments.length > 0
                      ? `${uploadedDocuments.length} document(s) uploaded`
                      : documentName || "Choose PDF/TXT files"}
                  </p>

                  <p className="text-xs text-slate-400 mt-2">
                    Multiple PDF / TXT supported
                  </p>
                </label>

                <button
                  onClick={uploadDocument}
                  disabled={isUploading}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 disabled:from-slate-700 disabled:to-slate-700 py-3 text-sm font-bold shadow-lg shadow-blue-500/30 transition"
                >
                  {isUploading ? "Indexing..." : "Upload & Index"}
                </button>
              </div>

              {uploadStatus && (
                <div className="rounded-3xl bg-white/[0.08] border border-white/15 p-4">
                  <p className="text-sm font-semibold">Status</p>
                  <p className="text-xs text-slate-300 mt-2 leading-5">
                    {uploadStatus}
                  </p>
                </div>
              )}

              {(summaryText || uploadedDocuments.length > 0) && (
                <div className="rounded-3xl bg-white/[0.08] border border-white/15 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-300">
                        Audio Summary
                      </p>
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {summaryTitle || "Upload a new document to generate summary"}
                      </p>
                    </div>
                    <span className="text-lg">🎧</span>
                  </div>

                  <button
                    onClick={isSummaryPlaying ? stopAllSpeech : playSummary}
                    disabled={!summaryText}
                    className="w-full rounded-2xl bg-black/20 border border-white/10 px-4 py-3 text-sm disabled:opacity-50"
                  >
                    {isSummaryPlaying ? "⏹ Stop Summary" : "▶ Play Summary"}
                  </button>
                </div>
              )}

              <div className="rounded-3xl bg-white/[0.08] border border-white/15 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-300">
                    Uploaded Documents
                  </p>
                  <span className="rounded-full bg-cyan-400/10 border border-cyan-400/25 text-cyan-300 px-2 py-1 text-[10px]">
                    {uploadedDocuments.length}
                  </span>
                </div>

                {uploadedDocuments.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No documents uploaded yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-auto pr-1">
                    {uploadedDocuments.map((doc) => (
                      <div
                        key={doc.document_id}
                        className="rounded-2xl bg-black/20 border border-white/10 p-3"
                      >
                        <p className="text-xs font-semibold text-slate-200 truncate">
                          📄 {doc.filename}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {doc.total_chunks} chunks indexed
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={clearDocuments}
                  className="mt-3 w-full rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 px-4 py-2 text-xs font-semibold text-red-200 transition"
                >
                  Clear Documents
                </button>
              </div>
            </div>
          </aside>

          <section className="flex-1 min-w-0 rounded-[28px] border border-white/15 bg-white/[0.08] backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {mode === "chat"
                    ? "Chat with your documents"
                    : "Talk with your documents"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {mode === "chat"
                    ? "Type questions and get grounded answers"
                    : "Press mic, speak, then press Enter or Send"}
                </p>
              </div>

              <div className="flex gap-2 items-center">
                <button
                  onClick={() => switchMode("chat")}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    mode === "chat"
                      ? "bg-cyan-400/20 border-cyan-300/40 text-cyan-200"
                      : "bg-white/10 border-white/10 text-slate-300"
                  }`}
                >
                  💬 Chat
                </button>

                <button
                  onClick={() => switchMode("talk")}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    mode === "talk"
                      ? "bg-purple-400/20 border-purple-300/40 text-purple-200"
                      : "bg-white/10 border-white/10 text-slate-300"
                  }`}
                >
                  🎙 Talk
                </button>

                {messages.length > 0 && (
                  <button
                    onClick={() => {
                      stopAllSpeech();
                      setMessages([]);
                    }}
                    className="rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs hover:bg-white/15"
                  >
                    Clear Chat
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-6 space-y-5">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <div className="mx-auto h-16 w-16 rounded-3xl bg-gradient-to-br from-cyan-300 to-violet-500 flex items-center justify-center text-3xl shadow-xl shadow-blue-500/30">
                      {mode === "chat" ? "✨" : "🎙"}
                    </div>

                    <h3 className="mt-4 text-2xl font-black">
                      {mode === "chat"
                        ? "Ask anything from your documents"
                        : "Tap the mic and ask out loud"}
                    </h3>

                    <p className="mt-2 text-sm text-slate-400">
                      {mode === "chat"
                        ? "Upload one or more files and start chatting."
                        : "Recording continues until you press Enter or Send."}
                    </p>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex fade-in ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[82%] rounded-3xl p-4 shadow-xl ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-blue-500 to-indigo-600 border border-blue-300/30"
                        : "bg-white/[0.08] border border-white/15"
                    }`}
                  >
                    {mode === "talk" && message.role === "assistant" ? (
                      <div className="space-y-3">
                        {message.text === "" && isThinking ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-300">
                              Preparing voice answer
                            </span>
                            <span className="flex gap-1">
                              <span className="typing-dot"></span>
                              <span className="typing-dot"></span>
                              <span className="typing-dot"></span>
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="rounded-[28px] bg-gradient-to-br from-white/[0.10] to-white/[0.04] border border-white/15 p-4 shadow-xl">
                              <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-xl shadow-lg shadow-blue-500/30">
                                  🎙️
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-100">
                                    AI voice response
                                  </p>

                                  <div className="mt-3 flex items-end gap-1 h-8">
                                    <span className="voice-bar h-3"></span>
                                    <span className="voice-bar h-6"></span>
                                    <span className="voice-bar h-4"></span>
                                    <span className="voice-bar h-7"></span>
                                    <span className="voice-bar h-5"></span>
                                    <span className="voice-bar h-8"></span>
                                    <span className="voice-bar h-4"></span>
                                    <span className="voice-bar h-6"></span>
                                    <span className="voice-bar h-3"></span>
                                  </div>

                                  <p className="mt-2 text-[11px] text-slate-400">
                                    {isAiSpeaking
                                      ? isAiPaused
                                        ? "Paused"
                                        : "Speaking now..."
                                      : "Voice response finished"}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex gap-2">
                                {isAiSpeaking && !isAiPaused && (
                                  <button
                                    onClick={pauseSpeech}
                                    className="rounded-full bg-white/10 border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/15 transition"
                                  >
                                    ⏸ Pause
                                  </button>
                                )}

                                {isAiSpeaking && isAiPaused && (
                                  <button
                                    onClick={resumeSpeech}
                                    className="rounded-full bg-emerald-400/15 border border-emerald-300/30 px-4 py-2 text-xs font-semibold text-emerald-200 transition"
                                  >
                                    ▶ Resume
                                  </button>
                                )}

                                <button
                                  onClick={stopAllSpeech}
                                  className="rounded-full bg-red-500/20 border border-red-400/30 px-4 py-2 text-xs font-semibold text-red-200 transition"
                                >
                                  ⏹ Stop
                                </button>
                              </div>
                            </div>

                            <details className="rounded-2xl bg-black/20 border border-white/10 p-3">
                              <summary className="cursor-pointer text-xs font-semibold text-cyan-300">
                                Show what AI said
                              </summary>
                              <p className="whitespace-pre-wrap text-sm leading-7 mt-3">
                                {message.text}
                              </p>
                            </details>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-7">
                        {message.text}
                      </p>
                    )}

                    {message.role === "assistant" &&
                      message.text === "" &&
                      isThinking &&
                      mode === "chat" && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300">Thinking</span>
                          <span className="flex gap-1">
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                          </span>
                        </div>
                      )}

                    {message.sources?.length > 0 && mode === "chat" && (
                      <details className="mt-4 rounded-2xl bg-black/20 border border-white/10 p-3">
                        <summary className="cursor-pointer text-sm font-semibold">
                          ✨ Sources
                        </summary>

                        <div className="mt-3 space-y-3">
                          {message.sources.slice(0, 6).map((source, idx) => {
                            const text = getSourceText(source);
                            const shortText =
                              text.length > 420
                                ? `${text.slice(0, 420)}...`
                                : text;

                            return (
                              <div
                                key={idx}
                                className="w-full text-left rounded-2xl border bg-white/[0.06] border-white/15 p-3"
                              >
                                <div className="flex justify-between gap-3 mb-2">
                                  <span className="text-sm font-semibold">
                                    Source {idx + 1}
                                  </span>
                                  <span className="text-xs text-yellow-200 text-right">
                                    {source.filename
                                      ? `${source.filename} · `
                                      : ""}
                                    {source.page ? `Page ${source.page}` : "TXT"}
                                  </span>
                                </div>

                                <p
                                  className="text-xs text-slate-300 leading-6"
                                  dangerouslySetInnerHTML={{
                                    __html: highlightSource(shortText, lastQuestion),
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}

              <div ref={chatEndRef} />
            </div>

            <div className="p-5 border-t border-white/10">
              {mode === "chat" ? (
                <div className="rounded-3xl bg-white/[0.08] border border-white/15 p-3 flex gap-3">
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={handleEnter}
                    placeholder="Ask anything about your documents..."
                    className="flex-1 resize-none bg-transparent outline-none text-sm text-white placeholder:text-slate-400 min-h-[44px] max-h-28 px-3 py-3"
                  />

                  <button
                    onClick={() => askQuestion()}
                    disabled={isThinking || !question.trim()}
                    className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-400 to-violet-600 disabled:from-slate-700 disabled:to-slate-700 flex items-center justify-center text-xl shadow-lg shadow-blue-500/30"
                  >
                    ➤
                  </button>
                </div>
              ) : (
                <div
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitTalkQuestion();
                    }
                  }}
                  className="rounded-3xl bg-white/[0.08] border border-white/15 p-4 outline-none"
                >
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        if (isListening) {
                          submitTalkQuestion();
                        } else {
                          startListening();
                        }
                      }}
                      disabled={isThinking}
                      className={`relative h-16 w-16 shrink-0 rounded-2xl flex items-center justify-center text-3xl shadow-xl transition ${
                        isListening
                          ? "bg-red-500/30 border border-red-300/40 listening-pulse"
                          : "bg-gradient-to-br from-purple-500 to-blue-500"
                      }`}
                    >
                      🎙
                    </button>

                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold">
                        {isListening
                          ? "Listening..."
                          : isThinking
                          ? "AI is answering..."
                          : "Tap to speak"}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {isListening
                          ? "Press Enter, Send, or tap mic when done."
                          : "Voice answer will play automatically."}
                      </p>

                      {(liveTranscript || spokenQuestion) && (
                        <div className="mt-3 rounded-2xl bg-black/20 border border-white/10 p-3">
                          <p className="text-[11px] text-slate-400">
                            {liveTranscript ? "Listening to:" : "You asked:"}
                          </p>
                          <p className="text-sm text-slate-200 truncate">
                            {liveTranscript || spokenQuestion}
                          </p>
                        </div>
                      )}
                    </div>

                    {isListening && (
                      <button
                        onClick={submitTalkQuestion}
                        className="shrink-0 rounded-full bg-emerald-400/20 border border-emerald-300/30 px-4 py-2 text-xs font-semibold text-emerald-200"
                      >
                        ⏎ Send
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}