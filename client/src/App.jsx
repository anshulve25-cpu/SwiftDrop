import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const SERVER_URL = "http://localhost:3001";
const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// ─── HELPERS ────────────────────────────────────────────────────────────────
async function computeHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 B/s";
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + " B/s";
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + " KB/s";
  return (bytesPerSec / (1024 * 1024)).toFixed(2) + " MB/s";
}

function getFileIcon(name) {
  if (!name) return "📄";
  const ext = name.split(".").pop().toLowerCase();
  const icons = {
    pdf: "📕", zip: "📦", rar: "📦", "7z": "📦",
    jpg: "🖼", jpeg: "🖼", png: "🖼", gif: "🖼", webp: "🖼", svg: "🖼",
    mp4: "🎬", mov: "🎬", avi: "🎬", mkv: "🎬",
    mp3: "🎵", wav: "🎵", flac: "🎵",
    doc: "📝", docx: "📝", txt: "📝", md: "📝",
    xls: "📊", xlsx: "📊", csv: "📊",
    js: "⚙️", ts: "⚙️", jsx: "⚙️", tsx: "⚙️", py: "⚙️",
    exe: "💾", dmg: "💾", apk: "💾",
  };
  return icons[ext] || "📄";
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

// ─── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #080b10;
    --surface: #0d1117;
    --surface2: #161b22;
    --border: #21262d;
    --accent: #00e5ff;
    --accent2: #7c3aed;
    --accent3: #10b981;
    --danger: #f87171;
    --warn: #fbbf24;
    --text: #e6edf3;
    --muted: #8b949e;
    --mono: 'Space Mono', monospace;
    --sans: 'Syne', sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--sans); min-height: 100vh; overflow-x: hidden; }
  body::before {
    content: '';
    position: fixed; inset: 0;
    background-image: linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none; z-index: 0;
  }
  .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
  .nav {
    display: flex; justify-content: space-between; align-items: center;
    padding: 18px 40px; border-bottom: 1px solid var(--border);
    background: rgba(8,11,16,0.8); backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 100;
  }
  .nav-logo { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-weight: 700; font-size: 15px; letter-spacing: 1px; }
  .nav-logo .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: pulse 2s infinite; }
  .nav-tag { font-family: var(--mono); font-size: 11px; padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border); color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .nav-tag .status-dot { width: 6px; height: 6px; border-radius: 50%; }
  .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; max-width: 1100px; margin: 0 auto; padding: 60px 40px; width: 100%; }
  .hero-title { font-family: var(--sans); font-size: 56px; font-weight: 800; line-height: 1; margin-bottom: 20px; letter-spacing: -1px; }
  .hero-title .accent { color: var(--accent); text-shadow: 0 0 30px rgba(0,229,255,0.4); }
  .hero-subtitle { font-family: var(--mono); font-size: 13px; color: var(--muted); line-height: 1.7; margin-bottom: 40px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; position: relative; overflow: hidden; }
  .card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: 0.5; }
  .btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px; border-radius: 10px; font-family: var(--mono); font-size: 13px; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s; width: 100%; letter-spacing: 0.5px; }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { background: #33ecff; box-shadow: 0 0 20px rgba(0,229,255,0.4); transform: translateY(-1px); }
  .btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  .btn-outline:hover { background: rgba(0,229,255,0.1); }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
  .divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: var(--muted); font-family: var(--mono); font-size: 11px; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .input-row { display: flex; gap: 10px; }
  .input-wrap { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 0 14px; transition: border-color 0.2s; }
  .input-wrap:focus-within { border-color: var(--accent); }
  .input-wrap input { border: none; background: transparent; color: var(--text); font-family: var(--mono); font-size: 14px; font-weight: 700; letter-spacing: 3px; padding: 13px 0; outline: none; width: 100%; }
  .input-wrap input::placeholder { color: var(--muted); letter-spacing: 1px; font-weight: 400; font-size: 13px; }
  .input-hash { color: var(--accent); font-family: var(--mono); font-weight: 700; }
  .room-display { text-align: center; padding: 16px; background: var(--surface2); border-radius: 12px; border: 1px solid var(--border); margin-bottom: 20px; }
  .room-label { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-bottom: 8px; letter-spacing: 2px; text-transform: uppercase; }
  .room-id { font-family: var(--mono); font-size: 36px; font-weight: 700; color: var(--accent); letter-spacing: 8px; text-shadow: 0 0 20px rgba(0,229,255,0.3); }
  .room-copy { background: transparent; border: none; color: var(--muted); font-family: var(--mono); font-size: 11px; cursor: pointer; margin-top: 8px; padding: 4px 8px; border-radius: 4px; transition: color 0.2s; }
  .room-copy:hover { color: var(--accent); }
  .status-bar { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 12px; color: var(--muted); padding: 10px 14px; background: var(--surface2); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 16px; min-height: 40px; }
  .drop-zone { border: 2px dashed var(--border); border-radius: 12px; padding: 28px 20px; text-align: center; cursor: pointer; transition: all 0.2s; margin-bottom: 16px; position: relative; }
  .drop-zone:hover, .drop-zone.drag-over { border-color: var(--accent); background: rgba(0,229,255,0.04); }
  .drop-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .drop-icon { font-size: 32px; margin-bottom: 8px; }
  .drop-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
  .drop-sub { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .file-info { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--surface2); border-radius: 10px; border: 1px solid var(--border); margin-bottom: 16px; }
  .file-icon { font-size: 24px; flex-shrink: 0; }
  .file-details { flex: 1; min-width: 0; }
  .file-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .file-size { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 2px; }
  .file-remove { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 16px; padding: 4px; border-radius: 4px; transition: color 0.2s; }
  .file-remove:hover { color: var(--danger); }
  .progress-wrap { margin-top: 16px; }
  .progress-header { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 11px; color: var(--muted); margin-bottom: 8px; }
  .progress-track { height: 4px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); border-radius: 4px; transition: width 0.3s; box-shadow: 0 0 8px rgba(0,229,255,0.5); }
  .progress-fill.done { background: linear-gradient(90deg, var(--accent3), #34d399); }
  .hero-right { display: flex; flex-direction: column; justify-content: center; gap: 20px; }
  .features { max-width: 1100px; margin: 0 auto 60px; padding: 0 40px; width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .feature-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; transition: border-color 0.2s, transform 0.2s; }
  .feature-card:hover { border-color: rgba(0,229,255,0.3); transform: translateY(-2px); }
  .feature-icon-wrap { width: 44px; height: 44px; border-radius: 10px; background: rgba(0,229,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 14px; border: 1px solid rgba(0,229,255,0.1); }
  .feature-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
  .feature-desc { font-family: var(--mono); font-size: 12px; color: var(--muted); line-height: 1.6; }
  .visualizer { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 32px 28px; }
  .vis-label { font-family: var(--mono); font-size: 11px; color: var(--muted); text-align: center; margin-bottom: 24px; letter-spacing: 2px; text-transform: uppercase; }
  .vis-nodes { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .vis-node { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .vis-node-circle { width: 64px; height: 64px; border-radius: 50%; background: var(--surface2); border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 26px; transition: border-color 0.3s, box-shadow 0.3s; }
  .vis-node-circle.active { border-color: var(--accent); box-shadow: 0 0 20px rgba(0,229,255,0.3); }
  .vis-node-label { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .vis-line { flex: 1; height: 2px; background: var(--border); position: relative; overflow: hidden; border-radius: 2px; }
  .vis-line-fill { position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
  .vis-line-fill.transferring { animation: sweep 1.5s linear infinite; }
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
  .stat-item { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
  .stat-label { font-family: var(--mono); font-size: 10px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
  .stat-value { font-family: var(--mono); font-size: 16px; font-weight: 700; color: var(--text); }
  .stat-value.accent { color: var(--accent); }
  .log-container { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; max-height: 140px; overflow-y: auto; margin-top: 16px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .log-entry { font-family: var(--mono); font-size: 11px; padding: 3px 0; display: flex; gap: 10px; align-items: flex-start; border-bottom: 1px solid rgba(33,38,45,0.5); }
  .log-entry:last-child { border-bottom: none; }
  .log-time { color: var(--muted); flex-shrink: 0; }
  .log-msg { color: var(--text); }
  .log-msg.success { color: var(--accent3); }
  .log-msg.error { color: var(--danger); }
  .log-msg.warn { color: var(--warn); }
  .log-msg.info { color: var(--accent); }
  footer { margin-top: auto; border-top: 1px solid var(--border); padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-size: 11px; color: var(--muted); }
  @keyframes pulse { 0%, 100% { opacity: 1; box-shadow: 0 0 10px var(--accent); } 50% { opacity: 0.5; box-shadow: 0 0 4px var(--accent); } }
  @keyframes sweep { 0% { left: -100%; } 100% { left: 100%; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.3s ease; }
  @media (max-width: 768px) {
    .hero { grid-template-columns: 1fr; padding: 32px 20px; gap: 32px; }
    .hero-title { font-size: 38px; }
    .features { grid-template-columns: 1fr; padding: 0 20px; }
    .nav { padding: 16px 20px; }
    footer { padding: 16px 20px; flex-direction: column; gap: 8px; text-align: center; }
  }
`;

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function App() {
  const [roomId, setRoomId] = useState("");
  const [inputId, setInputId] = useState("");
  const [phase, setPhase] = useState("home");
  const [role, setRole] = useState(null);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [connState, setConnState] = useState("disconnected");
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState([]);
  const [errMsg, setErrMsg] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);

  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const channelRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const logRef = useRef(null);
  const roomIdRef = useRef("");

  // Keep roomIdRef in sync so socket callbacks always have latest value
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const addLog = useCallback((msg, type = "default") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs(prev => [...prev.slice(-49), { msg, type, time }]);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  }, []);

  // Init socket ONCE
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
    socket.on("peer-joined", () => {
  console.log("PEER JOINED RECEIVED"); // add this
  addLog("Receiver joined! Starting WebRTC handshake...", "info");
  setPhase("connecting");
  startWebRTC(true);
});
    socketRef.current = socket;

    socket.on("connect", () => addLog("Connected to signaling server", "info"));
    socket.on("disconnect", () => addLog("Disconnected from signaling server", "error"));

    socket.on("join-error", ({ message }) => {
      setErrMsg(message);
      setPhase("error");
      addLog(message, "error");
    });

    socket.on("peer-joined", () => {
      addLog("Receiver joined! Starting WebRTC handshake...", "info");
      setPhase("connecting");
      startWebRTC(true);
    });

    socket.on("offer", async ({ offer }) => {
      addLog("Offer received — sending answer", "info");
      await startWebRTC(false);
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      socket.emit("answer", { roomId: roomIdRef.current, answer });
    });

    socket.on("answer", async ({ answer }) => {
      if (peerRef.current) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        addLog("Answer received — establishing connection", "info");
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (peerRef.current) await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    });

    socket.on("peer-disconnected", () => {
      addLog("Peer disconnected", "error");
      setConnState("disconnected");
      setPhase("error");
      setErrMsg("Peer disconnected unexpectedly.");
    });

    return () => socket.disconnect();
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (phase === "transferring") {
      timerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const startWebRTC = async (initiator) => {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit("ice-candidate", {
          roomId: roomIdRef.current,
          candidate: e.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      setConnState(peer.connectionState);
      if (peer.connectionState === "connected") {
        addLog("P2P connection established!", "success");
        setPhase("ready");
      }
      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        addLog("WebRTC connection failed", "error");
        setPhase("error");
        setErrMsg("Connection failed. Try refreshing and reconnecting.");
      }
    };

    if (initiator) {
      const channel = peer.createDataChannel("file-transfer", { ordered: true });
      channelRef.current = channel;
      setupChannel(channel);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current.emit("offer", { roomId: roomIdRef.current, offer });
    } else {
      peer.ondatachannel = (e) => {
        channelRef.current = e.channel;
        setupChannel(e.channel);
      };
    }
  };

  const setupChannel = (channel) => {
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      setConnState("connected");
      setPhase("ready");
      addLog("Data channel open — ready!", "success");
    };

    channel.onclose = () => {
      setConnState("closed");
      addLog("Data channel closed", "warn");
    };

    channel.onmessage = async (e) => {
      if (typeof e.data === "string") {
        if (e.data.startsWith("META:")) {
          const meta = JSON.parse(e.data.slice(5));
          chunksRef.current = [];
          chunksRef.current._meta = meta;
          setPhase("transferring");
          startTimeRef.current = Date.now();
          setElapsedTime(0);
          setProgress(0);
          setTransferred(0);
          addLog(`Receiving: ${meta.name} (${formatSize(meta.size)})`, "info");
        } else if (e.data.startsWith("HASH:")) {
          const receivedHash = e.data.slice(5);
          addLog("Verifying file integrity...", "info");
          const blob = new Blob(chunksRef.current);
          const buffer = await blob.arrayBuffer();
          const hb = await crypto.subtle.digest("SHA-256", buffer);
          const localHash = Array.from(new Uint8Array(hb)).map(b => b.toString(16).padStart(2, "0")).join("");
          if (localHash === receivedHash) {
            addLog("SHA-256 verified ✓ — downloading!", "success");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = chunksRef.current._meta?.name || "received_file";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setPhase("done");
            setProgress(100);
          } else {
            addLog("Hash mismatch — file corrupted!", "error");
            setPhase("error");
            setErrMsg("File integrity check failed. Please try again.");
          }
        }
      } else {
        chunksRef.current.push(e.data);
        const total = chunksRef.current._meta?.size || 1;
        const received = chunksRef.current.reduce((a, c) => a + c.byteLength, 0);
        const pct = Math.min(99, Math.round((received / total) * 100));
        setProgress(pct);
        setTransferred(received);
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setSpeed(elapsed > 0 ? received / elapsed : 0);
      }
    };
  };

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      addLog(`File too large: ${formatSize(f.size)}`, "error");
      return;
    }
    setFile(f);
    addLog(`Selected: ${f.name} (${formatSize(f.size)})`, "info");
  };

  const createRoom = () => {
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomId(id);
    roomIdRef.current = id;
    setRole("sender");
    socketRef.current.emit("create-room", id);
    setPhase("waiting");
    addLog(`Room created: ${id} — share this ID with receiver`, "success");
  };

  const joinRoom = () => {
    const id = inputId.trim().toUpperCase();
    if (!id || id.length < 4) return;
    setRoomId(id);
    roomIdRef.current = id;
    setRole("receiver");
    socketRef.current.emit("join-room", id);
    setPhase("waiting");
    addLog(`Joining room: ${id}`, "info");
  };

  const sendFile = async () => {
    if (!file || !channelRef.current || channelRef.current.readyState !== "open") {
      addLog("Cannot send — channel not open", "error");
      return;
    }
    setPhase("transferring");
    setProgress(0);
    setTransferred(0);
    setElapsedTime(0);
    startTimeRef.current = Date.now();

    addLog(`Computing SHA-256 for ${file.name}...`, "info");
    const hash = await computeHash(file);
    addLog("Hash computed — sending file", "info");

    const meta = { name: file.name, size: file.size, type: file.type };
    channelRef.current.send("META:" + JSON.stringify(meta));

    let offset = 0;
    const sendNextChunk = () => {
      if (!channelRef.current || channelRef.current.readyState !== "open") return;
      if (channelRef.current.bufferedAmount > 1024 * 1024) {
        setTimeout(sendNextChunk, 50);
        return;
      }
      if (offset >= file.size) {
        // All chunks sent — wait for buffer to drain then send hash
        const waitDrain = () => {
          if (channelRef.current.bufferedAmount > 0) {
            setTimeout(waitDrain, 100);
          } else {
            channelRef.current.send("HASH:" + hash);
            addLog("All chunks sent — waiting for receiver verification", "info");
            setPhase("done");
            setProgress(100);
          }
        };
        waitDrain();
        return;
      }
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();
      const thisOffset = offset;
      reader.onload = (e) => {
        if (channelRef.current?.readyState === "open") {
          channelRef.current.send(e.target.result);
          const sent = thisOffset + e.target.result.byteLength;
          setTransferred(sent);
          setProgress(Math.min(99, Math.round((sent / file.size) * 100)));
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setSpeed(elapsed > 0 ? sent / elapsed : 0);
          setTimeout(sendNextChunk, 0);
        }
      };
      reader.readAsArrayBuffer(slice);
      offset += CHUNK_SIZE;
    };
    sendNextChunk();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    peerRef.current?.close();
    peerRef.current = null;
    channelRef.current = null;
    chunksRef.current = [];
    setRoomId(""); setInputId(""); roomIdRef.current = "";
    setPhase("home"); setRole(null); setFile(null);
    setProgress(0); setSpeed(0); setTransferred(0);
    setConnState("disconnected"); setErrMsg("");
    setLogs([]); setElapsedTime(0);
  };

  const connColor = connState === "connected" ? "#10b981" : connState === "connecting" ? "#fbbf24" : "#ef4444";
  const isTransferring = phase === "transferring";
  const isDone = phase === "done";
  const eta = speed > 0 && file ? Math.round((file.size - transferred) / speed) : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* NAV */}
        <nav className="nav">
          <div className="nav-logo">
            <div className="dot" />
            <span>SWIFT</span>
            <span style={{ color: "#8b949e", fontWeight: 400 }}>DROP</span>
          </div>
          <div className="nav-tag">
            <div className="status-dot" style={{ background: connColor, boxShadow: `0 0 6px ${connColor}` }} />
            {connState === "connected" ? "P2P Connected" : connState === "connecting" ? "Negotiating..." : "End-to-End Encrypted"}
          </div>
        </nav>

        {/* HERO */}
        <div className="hero">

          {/* LEFT PANEL */}
          <div className="hero-left">
            <h1 className="hero-title">
              <span className="accent">Transfer</span><br />Files<br />Directly.
            </h1>
            <p className="hero-subtitle">
              No server storage. No upload limits.<br />
              Pure WebRTC peer-to-peer, SHA-256 verified.
            </p>

            <div className="card">

              {/* HOME */}
              {phase === "home" && (
                <div className="fade-in">
                  <button className="btn btn-primary" onClick={createRoom}>⊕ Create Room</button>
                  <div className="divider">or join existing</div>
                  <div className="input-row">
                    <div className="input-wrap">
                      <span className="input-hash">#</span>
                      <input
                        placeholder="Enter Room ID"
                        value={inputId}
                        maxLength={8}
                        onChange={e => setInputId(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === "Enter" && joinRoom()}
                      />
                    </div>
                    <button className="btn btn-outline" style={{ width: "auto" }} onClick={joinRoom}>Join</button>
                  </div>
                </div>
              )}

              {/* WAITING - SENDER */}
              {phase === "waiting" && role === "sender" && (
                <div className="fade-in">
                  <div className="room-display">
                    <div className="room-label">Share this Room ID</div>
                    <div className="room-id">{roomId}</div>
                    <button className="room-copy" onClick={copyRoomId}>
                      {copied ? "✓ Copied!" : "⎘ Copy to clipboard"}
                    </button>
                  </div>
                  <div className="status-bar">
                    <span>⏳</span>
                    <span>Waiting for receiver to join...</span>
                  </div>
                  <button className="btn btn-outline" onClick={reset}>✕ Cancel</button>
                </div>
              )}

              {/* WAITING - RECEIVER */}
              {phase === "waiting" && role === "receiver" && (
                <div className="fade-in">
                  <div className="status-bar">
                    <span>⏳</span>
                    <span>Joined <strong style={{ color: "var(--accent)" }}>{roomId}</strong> — waiting for sender...</span>
                  </div>
                  <button className="btn btn-outline" onClick={reset}>✕ Leave</button>
                </div>
              )}

              {/* CONNECTING */}
              {phase === "connecting" && (
                <div className="fade-in">
                  <div className="status-bar">
                    <span>🔄</span>
                    <span>Establishing WebRTC connection...</span>
                  </div>
                </div>
              )}

              {/* READY + SENDER */}
              {phase === "ready" && role === "sender" && (
                <div className="fade-in">
                  <div className="room-display" style={{ marginBottom: 16 }}>
                    <div className="room-label">Room</div>
                    <div className="room-id" style={{ fontSize: 22, letterSpacing: 4 }}>{roomId}</div>
                  </div>
                  {!file ? (
                    <div
                      className={`drop-zone ${drag ? "drag-over" : ""}`}
                      onDragOver={e => { e.preventDefault(); setDrag(true); }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
                    >
                      <input type="file" onChange={e => handleFile(e.target.files[0])} />
                      <div className="drop-icon">📂</div>
                      <div className="drop-title">Drop file here or click to browse</div>
                      <div className="drop-sub">Max {formatSize(MAX_FILE_SIZE)} · All formats</div>
                    </div>
                  ) : (
                    <>
                      <div className="file-info">
                        <span className="file-icon">{getFileIcon(file.name)}</span>
                        <div className="file-details">
                          <div className="file-name">{file.name}</div>
                          <div className="file-size">{formatSize(file.size)}</div>
                        </div>
                        <button className="file-remove" onClick={() => setFile(null)}>✕</button>
                      </div>
                      <button className="btn btn-primary" onClick={sendFile}>↑ Send File</button>
                    </>
                  )}
                </div>
              )}

              {/* READY + RECEIVER */}
              {phase === "ready" && role === "receiver" && (
                <div className="fade-in">
                  <div className="room-display" style={{ marginBottom: 16 }}>
                    <div className="room-label">Room</div>
                    <div className="room-id" style={{ fontSize: 22, letterSpacing: 4 }}>{roomId}</div>
                  </div>
                  <div className="status-bar">
                    <span>✅</span>
                    <span>Connected — waiting for sender to send a file...</span>
                  </div>
                </div>
              )}

              {/* TRANSFERRING + SENDER */}
              {phase === "transferring" && role === "sender" && file && (
                <div className="fade-in">
                  <div className="file-info">
                    <span className="file-icon">{getFileIcon(file.name)}</span>
                    <div className="file-details">
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{formatSize(transferred)} / {formatSize(file.size)}</div>
                    </div>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-header">
                      <span>Sending... {progress}%</span>
                      <span>{formatSpeed(speed)} · ETA {eta != null ? eta + "s" : "–"}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSFERRING + RECEIVER */}
              {phase === "transferring" && role === "receiver" && (
                <div className="fade-in">
                  <div className="file-info">
                    <span className="file-icon">{getFileIcon(chunksRef.current._meta?.name)}</span>
                    <div className="file-details">
                      <div className="file-name">{chunksRef.current._meta?.name || "Receiving..."}</div>
                      <div className="file-size">
                        {formatSize(transferred)}{chunksRef.current._meta ? ` / ${formatSize(chunksRef.current._meta.size)}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-header">
                      <span>Receiving... {progress}%</span>
                      <span>{formatSpeed(speed)}</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* DONE */}
              {isDone && (
                <div className="fade-in">
                  <div className="status-bar" style={{ borderColor: "var(--accent3)", color: "var(--accent3)" }}>
                    <span>🎉</span>
                    <span>{role === "sender" ? "File sent successfully!" : "File received & downloaded!"}</span>
                  </div>
                  {role === "sender" && file && (
                    <div className="file-info" style={{ marginBottom: 16 }}>
                      <span className="file-icon">{getFileIcon(file.name)}</span>
                      <div className="file-details">
                        <div className="file-name">{file.name}</div>
                        <div className="file-size">{formatSize(file.size)} · {elapsedTime}s</div>
                      </div>
                      <span style={{ color: "var(--accent3)", fontSize: 20 }}>✓</span>
                    </div>
                  )}
                  <button className="btn btn-outline" onClick={reset}>↺ Transfer Another</button>
                </div>
              )}

              {/* ERROR */}
              {phase === "error" && (
                <div className="fade-in">
                  <div className="status-bar" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                    <span>⚠</span>
                    <span>{errMsg || "An error occurred."}</span>
                  </div>
                  <button className="btn btn-outline" style={{ marginTop: 12, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={reset}>
                    ↺ Try Again
                  </button>
                </div>
              )}

              {/* LOG */}
              {logs.length > 0 && (
                <div className="log-container" ref={logRef}>
                  {logs.map((l, i) => (
                    <div key={i} className="log-entry">
                      <span className="log-time">{l.time}</span>
                      <span className={`log-msg ${l.type}`}>{l.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="hero-right">
            <div className="visualizer">
              <div className="vis-label">Live Transfer Visualizer</div>
              <div className="vis-nodes">
                <div className="vis-node">
                  <div className={`vis-node-circle ${connState === "connected" ? "active" : ""}`}>💻</div>
                  <div className="vis-node-label">SENDER</div>
                </div>
                <div className="vis-line">
                  <div className={`vis-line-fill ${isTransferring ? "transferring" : ""}`} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: connState === "connected" ? "var(--accent)" : "var(--muted)" }}>⇄</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>WebRTC</div>
                </div>
                <div className="vis-line">
                  <div className={`vis-line-fill ${isTransferring ? "transferring" : ""}`} style={{ animationDelay: "0.75s" }} />
                </div>
                <div className="vis-node">
                  <div className={`vis-node-circle ${connState === "connected" ? "active" : ""}`}>📱</div>
                  <div className="vis-node-label">RECEIVER</div>
                </div>
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-label">Speed</div>
                  <div className={`stat-value ${speed > 0 ? "accent" : ""}`}>{speed > 0 ? formatSpeed(speed) : "—"}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Progress</div>
                  <div className={`stat-value ${progress > 0 ? "accent" : ""}`}>{progress > 0 ? progress + "%" : "—"}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Transferred</div>
                  <div className="stat-value">{transferred > 0 ? formatSize(transferred) : "—"}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Elapsed</div>
                  <div className="stat-value">{elapsedTime > 0 ? elapsedTime + "s" : "—"}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>How it works</div>
              {[
                ["01", "Sender creates a room and shares the 6-char ID"],
                ["02", "Receiver joins — WebRTC handshake via signaling server"],
                ["03", "Direct encrypted P2P channel established"],
                ["04", "File streams in 64 KB chunks, SHA-256 verified on receipt"],
              ].map(([n, t]) => (
                <div key={n} style={{ display: "flex", gap: 14, marginBottom: 12 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>{n}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <div className="features">
          {[
            { icon: "⚡", title: "64 KB Chunks", desc: "Optimized chunk size with back-pressure control for max throughput" },
            { icon: "🛡️", title: "SHA-256 Verified", desc: "Every file integrity-checked before download — zero corruption" },
            { icon: "🔒", title: "No Server Storage", desc: "Files go peer-to-peer. Signaling server never sees your data" },
            { icon: "📡", title: "STUN + TURN Relay", desc: "Works behind NAT and firewalls via TURN fallback" },
            { icon: "📊", title: "Live Transfer Stats", desc: "Real-time speed, progress, ETA and transfer log" },
            { icon: "🌐", title: "Cross-Device", desc: "Desktop to mobile, any browser that supports WebRTC" },
          ].map((f, i) => (
            <div className="feature-card" key={i}>
              <div className="feature-icon-wrap">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <footer>
          <span>SwiftDrop · No data stored · WebRTC encrypted</span>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>v2.0</span>
        </footer>
      </div>
    </>
  );
}