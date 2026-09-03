import { addLog } from "./logger";
import { LipsyncTh } from "../modules/lipsync-th";

const BACKEND_API_URL = "http://localhost:8000";
const MOUTH_KEYS = ["Fcl_MTH_A", "Fcl_MTH_E", "Fcl_MTH_I", "Fcl_MTH_O", "Fcl_MTH_U", "Fcl_MTH_Close", "Fcl_MTH_Large"];
const THAI_VISEME_MORPHS = {
    aa: "Fcl_MTH_A",
    E: "Fcl_MTH_E",
    I: "Fcl_MTH_I",
    O: "Fcl_MTH_O",
    U: "Fcl_MTH_U",
    PP: "Fcl_MTH_Close",
    FF: "Fcl_MTH_Close",
    TH: "Fcl_MTH_A",
    DD: "Fcl_MTH_A",
    kk: "Fcl_MTH_A",
    nn: "Fcl_MTH_A",
    RR: "Fcl_MTH_A",
    CH: "Fcl_MTH_E",
    SS: "Fcl_MTH_I"
};

function buildWordTimings(text, durationMs) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const safeWords = words.length ? words : [text.trim()];
    const weights = safeWords.map((word) => Math.max(1, Array.from(word).length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    let elapsed = 0;

    return safeWords.reduce((result, word, index) => {
        const duration = (durationMs * weights[index]) / totalWeight;
        result.words.push(word);
        result.wtimes.push(elapsed);
        result.wdurations.push(duration);
        elapsed += duration;
        return result;
    }, { words: [], wtimes: [], wdurations: [] });
}

let synthVoices = [];

if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const loadVoices = () => {
        synthVoices = window.speechSynthesis.getVoices();
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
}

/**
 * Stop any current audio or speech synthesis
 */
export function stopAllSpeech(head = window.medfonHead) {
    if (head && typeof head.stopSpeaking === "function") {
        head.stopSpeaking();
    }

    if (window.currentMedfonAudio) {
        try {
            window.currentMedfonAudio.pause();
            window.currentMedfonAudio = null;
        } catch {
            // Ignore audio cleanup errors.
        }
    }
    if (window.currentMedfonAnimationFrame) {
        cancelAnimationFrame(window.currentMedfonAnimationFrame);
        window.currentMedfonAnimationFrame = null;
    }
    if (window.currentMedfonInterval) {
        clearInterval(window.currentMedfonInterval);
        window.currentMedfonInterval = null;
    }
    if (window.currentTypewriterInterval) {
        clearInterval(window.currentTypewriterInterval);
        window.currentTypewriterInterval = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
            window.speechSynthesis.cancel();
        } catch {
            // Ignore browser speech cleanup errors.
        }
    }
    resetAvatarMouth(head);
}

function resetAvatarMouth(head) {
    if (!head?.setFixedValue) return;
    MOUTH_KEYS.forEach((key) => setAvatarMouthValue(head, key, 0, null));
}

function setAvatarMouthValue(head, key, value, fixedValue = value) {
    if (!head) return;
    if (head.setFixedValue && fixedValue !== null) {
        head.setFixedValue(key, fixedValue, 0);
    } else if (head.setFixedValue) {
        head.setFixedValue(key, null);
    }

    head.scene?.traverse((object) => {
        const index = object.morphTargetDictionary?.[key];
        if (object.isMesh && index !== undefined && object.morphTargetInfluences) {
            object.morphTargetInfluences[index] = value;
        }
    });
    head.render?.();
}

export function testWideMouth(head) {
    if (!head?.setFixedValue) return false;
    const available = Boolean(head.mtAvatar?.Fcl_MTH_Large);
    addLog("AVATAR", `ทดสอบอ้าปากกว้าง (Fcl_MTH_Large: ${available ? "พบ" : "ไม่พบ"})`);
    if (!available) return false;

    stopAllSpeech(head);
    setAvatarMouthValue(head, "Fcl_MTH_Large", 1, 1);
    window.currentWideMouthTimeout = window.setTimeout(() => {
        setAvatarMouthValue(head, "Fcl_MTH_Large", 0, null);
        window.currentWideMouthTimeout = null;
    }, 2500);
    return true;
}

function startAvatarMouthAnimation(head, text, durationMs) {
    if (!head?.setFixedValue) return;

    if (window.currentMedfonAnimationFrame) {
        cancelAnimationFrame(window.currentMedfonAnimationFrame);
    }

    const thaiVisemes = new LipsyncTh().wordsToVisemes(text);
    const visemes = thaiVisemes.visemes.length
        ? thaiVisemes.visemes.map((viseme, index) => ({
            key: THAI_VISEME_MORPHS[viseme],
            start: (thaiVisemes.times[index] / Math.max(1, thaiVisemes.times.at(-1) + thaiVisemes.durations.at(-1))) * durationMs,
            duration: (thaiVisemes.durations[index] / Math.max(1, thaiVisemes.times.at(-1) + thaiVisemes.durations.at(-1))) * durationMs
        }))
        : [];
    const startedAt = performance.now();

    const animate = () => {
        const elapsed = performance.now() - startedAt;
        if (elapsed >= durationMs) {
            resetAvatarMouth(head);
            window.currentMedfonAnimationFrame = null;
            return;
        }

        let activeKey = null;
        let progress = 0;
        const active = visemes.find((item) => elapsed >= item.start && elapsed < item.start + item.duration);
        if (active) {
            activeKey = active.key;
            progress = Math.sin(((elapsed - active.start) / Math.max(1, active.duration)) * Math.PI);
        } else {
            activeKey = MOUTH_KEYS[Math.floor(elapsed / 140) % (MOUTH_KEYS.length - 1)];
            progress = 0.35 + Math.abs(Math.sin(elapsed / 110)) * 0.35;
        }

        MOUTH_KEYS.forEach((key) => setAvatarMouthValue(head, key, key === activeKey ? progress : 0));
        window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
    };

    window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
}

export async function speakTextWithAvatar(head, text, voice = "ped", lang = "th-TH", onTextUpdate = null) {
    if (!text) return;

    stopAllSpeech(head);

    const cleanText = text.replace(/[*#_`~]/g, "").trim();

    addLog("TTS", `ส่งข้อความไปแปลงเป็นเสียงพากย์ (Model: ptm-tts-1, Voice: ${voice})`);

    // 1. Try Pathumma TTS API (ptm-tts-1) from FastAPI Backend
    try {
        const response = await fetch(`${BACKEND_API_URL}/api/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanText, voice: voice, model: "ptm-tts-1" })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.audio_base64) {
                addLog("TTS", "ได้รับไฟล์เสียง WAV จาก Pathumma TokenMind TTS เรียบร้อยแล้ว", `Source: ${data.source}`);
                playCleanAudio(head, data.audio_base64, cleanText, onTextUpdate);
                return;
            }
        }
    } catch (err) {
        addLog("TTS", "Pathumma TTS API ไม่พร้อมใช้งาน สลับใช้ Web Speech API ภาษาไทย", err.message);
    }

    // 2. Fallback to Web Speech API (th-TH)
    speakWithWebSpeechFallback(head, cleanText, lang, onTextUpdate);
}

/**
 * Play Audio cleanly using TalkingHead native speakAudio engine, Sync Visemes automatically, and stream text word-by-word
 */
async function playCleanAudio(head, audioSrc, fullText, onTextUpdate) {
    let audioDurationSec = 3.5;

    try {
        if (head && typeof head.speakAudio === "function") {
            const base64Clean = audioSrc.replace(/^data:audio\/\w+;base64,/, "");
            const binaryStr = window.atob(base64Clean);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;

            const audioCtx = head.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }

            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            audioDurationSec = audioBuffer.duration;

            const durationMs = audioDurationSec * 1000;

            addLog("AVATAR", `TalkingHead native lip-sync test (Language: en) ความยาว: ${audioDurationSec.toFixed(1)} วินาที`);

            const timings = buildWordTimings(fullText, durationMs);
            head.speakAudio(
                {
                    audio: audioBuffer,
                    words: timings.words,
                    wtimes: timings.wtimes,
                    wdurations: timings.wdurations
                },
                { lipsyncLang: "en" }
            );
            startAvatarMouthAnimation(head, fullText, durationMs);

        } else {
            throw new Error("TalkingHead.speakAudio is unavailable");
        }
    } catch (e) {
        addLog("AVATAR", "TalkingHead native audio failed", e.message);
    }

    // Word-by-Word Synchronized Typing Animation
    if (onTextUpdate) {
        const chars = Array.from(fullText);
        const totalDurationMs = audioDurationSec * 1000;
        const charDelay = Math.max(25, totalDurationMs / chars.length);

        let charIdx = 0;
        onTextUpdate("");

        window.currentTypewriterInterval = setInterval(() => {
            charIdx++;
            onTextUpdate(chars.slice(0, charIdx).join(""));
            if (charIdx >= chars.length) {
                clearInterval(window.currentTypewriterInterval);
                window.currentTypewriterInterval = null;
            }
        }, charDelay);
    }
}

/**
 * Web Speech API Fallback (th-TH) with synchronized typing animation and 60fps mouth movement
 */
function speakWithWebSpeechFallback(head, text, lang = "th-TH", onTextUpdate = null) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.05;
    utterance.pitch = 1.2;

    const voices = synthVoices.length > 0 ? synthVoices : window.speechSynthesis.getVoices();
    const thaiVoice = voices.find((v) => v.lang && (v.lang.includes("th") || v.lang.includes("TH")));
    if (thaiVoice) {
        utterance.voice = thaiVoice;
    }

    utterance.onstart = () => {
        addLog("TTS", "เริ่มเล่นเสียงภาษาไทยผ่าน Web Speech API");

        if (onTextUpdate) {
            const chars = Array.from(text);
            let charIdx = 0;
            onTextUpdate("");

            window.currentTypewriterInterval = setInterval(() => {
                charIdx++;
                onTextUpdate(chars.slice(0, charIdx).join(""));
                if (charIdx >= chars.length) {
                    clearInterval(window.currentTypewriterInterval);
                    window.currentTypewriterInterval = null;
                }
            }, 60);
        }

        // Web Speech cannot provide timestamps for native lip-sync.
    };

    utterance.onend = utterance.onerror = () => {
        stopAllSpeech(head);
        if (onTextUpdate) {
            onTextUpdate(text);
        }
    };

    window.speechSynthesis.speak(utterance);
}
