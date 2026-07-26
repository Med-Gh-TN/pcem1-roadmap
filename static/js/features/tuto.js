/**
 * @file static/js/features/tuto.js
 * @description Apple-Grade Voice and Text Logic Controller for Tuto IA. Features native RTL, interactive prompt chips, and precision scrolling.
 * @layer Core Logic / Side Effect
 */

let ws = null;
let connected = false;
let isMuted = false;

// Auto-Scroll Tracking
let isUserScrolledUp = false;

// Structured context matching the backend Jinja template
let currentContext = {
    theme: "Général",
    filename: "Document Inconnu",
    notes: "Aucune note."
};

// Audio Capture State
let audioContext = null;
let mediaStream = null;
let processor = null;
let source = null;

// Audio Playback State
let playbackContext = null;
let nextPlayTime = 0;
let activeSources = [];

// DOM Element References
let connectBtn = null, textInput = null, sendBtn = null, chatContainer = null;
let statusDot = null, statusText = null, eqBars = null, statusBadge = null, scrollBottomBtn = null;
let currentUserBubble = null, currentModelBubble = null;

export async function initTuto() {
    initDOMElements();
    updateConnectUIState("disconnected");
}

export function startTutoSession(contextData) {
    if (contextData) {
        currentContext = contextData;
    }
}

export function stopTutoSession() {
    disconnect();
}

// Global hook for the floating scroll button
window.forceTutoScrollBottom = function() {
    isUserScrolledUp = false;
    scrollToBottom(true);
};

// Global hook for Apple quick action prompt chips
window.sendTutoQuickPrompt = function(promptText) {
    if (!promptText) return;
    
    // Create user message bubble
    createChatBubble("user", promptText);
    scrollToBottom(true);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "text", text: promptText }));
    } else {
        // Auto-connect if offline when chip is clicked
        connectWithInitialText(promptText);
    }
};

function connectWithInitialText(initialText) {
    connect();
    // Wait briefly for connection before pushing text
    const checkInterval = setInterval(() => {
        if (connected && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "text", text: initialText }));
            clearInterval(checkInterval);
        }
    }, 200);
    setTimeout(() => clearInterval(checkInterval), 5000);
}

function initDOMElements() {
    connectBtn = document.getElementById("connect-btn");
    textInput = document.getElementById("text-input");
    sendBtn = document.getElementById("send-btn");
    chatContainer = document.getElementById("chat-container");
    statusDot = document.getElementById("status-dot");
    statusText = document.getElementById("status-text");
    statusBadge = document.getElementById("tuto-status-badge");
    eqBars = document.getElementById("eq-bars");
    scrollBottomBtn = document.getElementById("scroll-bottom-btn");

    if (chatContainer) {
        // Smart Scroll Detector: Precision distance to bottom check
        chatContainer.addEventListener("scroll", () => {
            const distanceToBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
            isUserScrolledUp = distanceToBottom > 40;
            
            if (scrollBottomBtn) {
                if (isUserScrolledUp) {
                    scrollBottomBtn.classList.remove("hidden");
                    scrollBottomBtn.classList.add("flex");
                } else {
                    scrollBottomBtn.classList.add("hidden");
                    scrollBottomBtn.classList.remove("flex");
                }
            }
        });
    }

    if (connectBtn) {
        const newBtn = connectBtn.cloneNode(true);
        connectBtn.parentNode.replaceChild(newBtn, connectBtn);
        connectBtn = newBtn;
        connectBtn.addEventListener("click", () => {
            if (connected) disconnect();
            else connect();
        });
    }

    if (sendBtn) {
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        sendBtn = newSendBtn;
        sendBtn.addEventListener("click", sendTextMessage);
    }
    
    if (textInput) {
        const newInput = textInput.cloneNode(true);
        textInput.parentNode.replaceChild(newInput, textInput);
        textInput = newInput;
        textInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendTextMessage();
        });
    }
}

function connect() {
    updateConnectUIState("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/tuto`;
    
    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
        ws.send(JSON.stringify({ context: currentContext }));
    };

    ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
            playPcmChunk(event.data);
        } else {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === "status" && msg.text === "connected") {
                    connected = true;
                    updateConnectUIState("connected");
                    await startMicrophone();
                } else if (msg.type === "interrupted") {
                    stopAllPlayback();
                    currentModelBubble = null;
                } else if (msg.type === "transcription") {
                    handleTranscription(msg.speaker, msg.text);
                } else if (msg.type === "error") {
                    console.error(`[Tuto IA] Error: ${msg.text}`);
                    disconnect();
                }
            } catch (e) {
                console.error("Failed to parse websocket message", e);
            }
        }
    };

    ws.onerror = () => {
        console.error("WebSocket error occurred.");
        disconnect();
    };
    ws.onclose = () => disconnectCleanUp();
}

function disconnect() {
    if (ws) {
        ws.close();
        ws = null;
    }
    disconnectCleanUp();
}

function disconnectCleanUp() {
    connected = false;
    updateConnectUIState("disconnected");
    stopMicrophone();
    stopAllPlayback();
    if (playbackContext) {
        playbackContext.close();
        playbackContext = null;
    }
    currentUserBubble = null;
    currentModelBubble = null;
}

function updateConnectUIState(state) {
    if (!connectBtn) return;
    const label = connectBtn.querySelector("span.tracking-wide");

    if (state === "connecting") {
        if (label) label.innerText = "Connexion en cours...";
        if (statusText) statusText.innerText = "Connexion...";
        connectBtn.style.opacity = "0.7";
        connectBtn.style.pointerEvents = "none";
    } 
    else if (state === "connected") {
        if (label) label.innerText = "Quitter la discussion";
        if (eqBars) {
            eqBars.classList.remove("hidden");
            eqBars.classList.add("flex");
        }
        if (statusDot) {
            statusDot.classList.add("bg-emerald-500", "animate-pulse");
            statusDot.classList.remove("bg-slate-400", "bg-rose-500");
        }
        if (statusBadge) {
            statusBadge.classList.remove("bg-slate-100", "border-slate-200/80");
            statusBadge.classList.add("bg-emerald-50", "border-emerald-200/80");
        }
        if (statusText) {
            statusText.innerText = "En direct avec l'IA";
            statusText.classList.remove("text-slate-600");
            statusText.classList.add("text-emerald-700");
        }
        connectBtn.style.opacity = "1";
        connectBtn.style.pointerEvents = "auto";
        if(textInput) textInput.disabled = false;
        if(sendBtn) sendBtn.disabled = false;
    } 
    else if (state === "disconnected") {
        if (label) label.innerText = "Rejoindre la discussion vocale";
        if (eqBars) {
            eqBars.classList.add("hidden");
            eqBars.classList.remove("flex");
        }
        if (statusDot) {
            statusDot.classList.remove("bg-emerald-500", "animate-pulse");
            statusDot.classList.add("bg-slate-400");
        }
        if (statusBadge) {
            statusBadge.classList.add("bg-slate-100", "border-slate-200/80");
            statusBadge.classList.remove("bg-emerald-50", "border-emerald-200/80");
        }
        if (statusText) {
            statusText.innerText = "Hors ligne";
            statusText.classList.add("text-slate-600");
            statusText.classList.remove("text-emerald-700");
        }
        connectBtn.style.opacity = "1";
        connectBtn.style.pointerEvents = "auto";
        if(textInput) textInput.disabled = true;
        if(sendBtn) sendBtn.disabled = true;
    }
}

async function startMicrophone() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        source = audioContext.createMediaStreamSource(mediaStream);
        
        processor = audioContext.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (e) => {
            if (!connected || isMuted) return;
            const float32Array = e.inputBuffer.getChannelData(0);
            const pcmBuffer = float32ToInt16(float32Array);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(pcmBuffer);
            }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        initPlayback();
        isMuted = false;
    } catch (err) {
        console.error(`Mic access failed: ${err.message}`);
        alert("Impossible d'accéder au microphone.");
        disconnect();
    }
}

function stopMicrophone() {
    if (processor) { processor.disconnect(); processor = null; }
    if (source) { source.disconnect(); source = null; }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (audioContext) { audioContext.close(); audioContext = null; }
}

function float32ToInt16(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}

function initPlayback() {
    playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    nextPlayTime = playbackContext.currentTime;
}

function playPcmChunk(arrayBuffer) {
    if (!playbackContext) return;
    
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
    }
    
    const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const sourceNode = playbackContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(playbackContext.destination);
    
    const currentTime = playbackContext.currentTime;
    if (nextPlayTime < currentTime) nextPlayTime = currentTime + 0.05;
    
    sourceNode.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
    
    activeSources.push(sourceNode);
    
    sourceNode.onended = () => {
        activeSources = activeSources.filter(s => s !== sourceNode);
    };
}

function stopAllPlayback() {
    activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    activeSources = [];
    nextPlayTime = playbackContext ? playbackContext.currentTime : 0;
}

function sendTextMessage() {
    if (!textInput || !textInput.value.trim()) return;
    const text = textInput.value.trim();
    
    createChatBubble("user", text);
    scrollToBottom(true);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "text", text: text }));
    }
    textInput.value = "";
}

function handleTranscription(speaker, text) {
    if (speaker === "user") {
        if (!currentUserBubble) {
            currentUserBubble = createChatBubble("user", "");
            currentModelBubble = null;
        }
        const textNode = document.createTextNode(text || "");
        currentUserBubble.querySelector(".chat-bubble-text").appendChild(textNode);
    } else if (speaker === "model") {
        if (!currentModelBubble) {
            currentModelBubble = createChatBubble("model", "");
            currentUserBubble = null;
        }
        const textNode = document.createTextNode(text || "");
        currentModelBubble.querySelector(".chat-bubble-text").appendChild(textNode);
    }
    
    // Auto-scroll unless user deliberately scrolled up to read past history
    scrollToBottom();
}

function createChatBubble(sender, initialText) {
    const wrapper = document.createElement("div");
    
    if (sender === "user") {
        wrapper.className = "flex items-start gap-2.5 self-end flex-row-reverse max-w-[88%] animate-fade-in";
        wrapper.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-[rgb(2,132,199)] to-sky-500 flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 mt-1 shadow-2xs">VS</div>
            <div class="flex flex-col items-end">
                <span class="text-[9px] text-slate-400 uppercase tracking-wider mb-1 font-bold mr-1">Vous</span>
                <div class="bg-[rgb(2,132,199)] text-white rounded-2xl rounded-tr-2xs px-4 py-2.5 text-xs shadow-xs leading-relaxed font-sans">
                    <span class="chat-bubble-text" dir="auto"></span>
                </div>
            </div>
        `;
    } else {
        wrapper.className = "flex items-start gap-2.5 max-w-[88%] animate-fade-in";
        wrapper.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-600 to-sky-600 flex items-center justify-center text-[10px] font-extrabold text-white shrink-0 mt-1 shadow-2xs">IA</div>
            <div class="flex flex-col items-start">
                <span class="text-[9px] text-slate-400 uppercase tracking-wider mb-1 font-bold ml-1">Tuto IA</span>
                <div class="bg-white border border-slate-200/90 text-slate-800 rounded-2xl rounded-tl-2xs px-4 py-2.5 text-xs shadow-xs leading-relaxed font-sans">
                    <span class="chat-bubble-text" dir="auto"></span>
                </div>
            </div>
        `;
    }
    
    if (initialText) {
        wrapper.querySelector(".chat-bubble-text").textContent = initialText;
    }
    
    if (chatContainer) chatContainer.appendChild(wrapper);
    return wrapper;
}

function scrollToBottom(force = false) {
    if (!chatContainer) return;
    
    if (force || !isUserScrolledUp) {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: "smooth"
        });
        
        if (scrollBottomBtn) {
            scrollBottomBtn.classList.add("hidden");
            scrollBottomBtn.classList.remove("flex");
        }
    }
}