import { addLog } from "./logger";
import { LipsyncTh } from "../modules/lipsync-th";

const BACKEND_API_URL = "http://localhost:8000";
const MOUTH_KEYS = ["Fcl_MTH_A", "Fcl_MTH_E", "Fcl_MTH_I", "Fcl_MTH_O", "Fcl_MTH_U", "Fcl_MTH_Close", "Fcl_MTH_Large", "jawOpen", "mouthOpen"];
const VISEME_KEYS = ["aa", "E", "I", "O", "U", "PP", "FF", "TH", "DD", "kk", "nn", "RR", "CH", "SS"];
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

function buildThaiVisemeTimings(text, durationMs) {
    const thaiVisemes = new LipsyncTh().wordsToVisemes(text);
    if (!thaiVisemes.visemes.length) {
        return { visemes: [], vtimes: [], vdurations: [] };
    }

    const totalVisemeTime = Math.max(
        1,
        thaiVisemes.times.at(-1) + thaiVisemes.durations.at(-1)
    );

    return thaiVisemes.visemes.reduce((result, viseme, index) => {
        if (!THAI_VISEME_MORPHS[viseme]) return result;

        result.visemes.push(viseme);
        result.vtimes.push((thaiVisemes.times[index] / totalVisemeTime) * durationMs);
        result.vdurations.push((thaiVisemes.durations[index] / totalVisemeTime) * durationMs);
        return result;
    }, { visemes: [], vtimes: [], vdurations: [] });
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

function getActiveHead(head) {
    return head || (typeof window !== "undefined" ? window.medfonHead : null);
}

/**
 * Stop any current audio or speech synthesis
 */
export function stopAllSpeech(head) {
    const h = getActiveHead(head);
    if (h && typeof h.stopSpeaking === "function") {
        h.stopSpeaking();
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
    resetAvatarMouth(h);
}

function resetAvatarMouth(head) {
    const h = getActiveHead(head);
    if (!h?.mtAvatar) return;
    [...MOUTH_KEYS, ...VISEME_KEYS.map((key) => `viseme_${key}`)].forEach((key) => {
        if (typeof h.setFixedValue === "function") {
            h.setFixedValue(key, null);
        }
        const morph = h.mtAvatar[key];
        if (morph) {
            morph.fixed = null;
            morph.realtime = null;
            morph.needsUpdate = true;
        }
        setSceneMorphValue(h, key, 0);
    });
}

function setSceneMorphValue(head, key, value) {
    if (!head?.scene) return;
    const lowerKey = key.toLowerCase();
    head.scene.traverse((obj) => {
        if (!obj.isMesh || !obj.morphTargetDictionary || !obj.morphTargetInfluences) return;
        const targetName = Object.keys(obj.morphTargetDictionary).find(
            (name) => name.toLowerCase() === lowerKey
        );
        if (targetName !== undefined) {
            obj.morphTargetInfluences[obj.morphTargetDictionary[targetName]] = value;
        }
    });
}

function setAvatarMouthValue(head, key, value) {
    const h = getActiveHead(head);
    if (typeof h?.setFixedValue === "function") {
        h.setFixedValue(key, value > 0.01 ? value : null);
    }
    const morph = h?.mtAvatar?.[key];
    if (morph) {
        morph.fixed = value > 0.01 ? value : null;
        morph.realtime = value;
        morph.needsUpdate = true;
    }
    setSceneMorphValue(h, key, value);
}

/**
 * Natural Thai Mouth Animation Loop (60 FPS)
 * Dynamically animates visemes and mouth blendshapes smoothly based on Thai phonetic timing.
 */
export function startThaiMouthAnimation(head, durationMs, text = "") {
    const h = getActiveHead(head);
    if (!h) return;

    if (window.currentMedfonAnimationFrame) {
        cancelAnimationFrame(window.currentMedfonAnimationFrame);
        window.currentMedfonAnimationFrame = null;
    }

    const availableKeys = [
        ...MOUTH_KEYS,
        ...VISEME_KEYS.map((key) => `viseme_${key}`)
    ].filter((key) => h.mtAvatar && h.mtAvatar[key]);

    if (!availableKeys.length) return;

    addLog("AVATAR", `👄 เริ่มลูปขยับปากธรรมชาติ (${availableKeys.length} morphs, ${(durationMs / 1000).toFixed(1)}s)`);

    const thaiVisemes = new LipsyncTh().wordsToVisemes(text || "สวัสดีครับ");
    const totalVisemeTime = Math.max(1, thaiVisemes.times.at(-1) + thaiVisemes.durations.at(-1));
    const visemes = thaiVisemes.visemes.map((viseme, index) => ({
        key: THAI_VISEME_MORPHS[viseme] || "Fcl_MTH_A",
        visemeKey: `viseme_${viseme}`,
        start: (thaiVisemes.times[index] / totalVisemeTime) * durationMs,
        duration: (thaiVisemes.durations[index] / totalVisemeTime) * durationMs
    }));

    const startTime = performance.now();
    const currentValues = {};

    const animate = (now) => {
        const elapsed = now - startTime;
        if (elapsed >= durationMs) {
            resetAvatarMouth(h);
            window.currentMedfonAnimationFrame = null;
            return;
        }

        const active = visemes.find((item) => elapsed >= item.start && elapsed < item.start + item.duration);

        // Smooth natural speech mouth opening progress with smooth LERP
        const activeProgress = active
            ? Math.min(0.4, Math.sin(((elapsed - active.start) / Math.max(1, active.duration)) * Math.PI) * 0.45)
            : 0.05;

        const activeKey = active?.key || "Fcl_MTH_A";
        const activeVisemeKey = active?.visemeKey || "viseme_aa";
        const activeKeys = new Set([activeKey, activeVisemeKey].filter(Boolean));

        availableKeys.forEach((key) => {
            const targetValue = activeKeys.has(key)
                ? activeProgress
                : key === "jawOpen" || key === "mouthOpen"
                    ? activeProgress * 0.3
                    : 0;

            // Smooth LERP (linear interpolation) to prevent rapid jittery snapping
            const prev = currentValues[key] || 0;
            const smoothedValue = prev + (targetValue - prev) * 0.12;
            currentValues[key] = smoothedValue;

            if (typeof h.setValue === "function") {
                h.setValue(key, smoothedValue > 0.01 ? smoothedValue : 0);
            } else if (typeof h.setFixedValue === "function") {
                h.setFixedValue(key, smoothedValue > 0.01 ? smoothedValue : null);
            }
            setSceneMorphValue(h, key, smoothedValue);
        });

        window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
    };

    window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
}

export function testWideMouth(head) {
    const h = getActiveHead(head);
    if (!h) return false;
    addLog("AVATAR", "ทดสอบอ้าปาก 100%");
    stopAllSpeech(h);

    const wideKeys = ["Fcl_MTH_A", "Fcl_MTH_Large", "jawOpen", "viseme_aa", "mouthOpen"];
    wideKeys.forEach((key) => {
        setAvatarMouthValue(h, key, 0.8);
    });

    window.currentWideMouthTimeout = window.setTimeout(() => {
        resetAvatarMouth(h);
        window.currentWideMouthTimeout = null;
    }, 3000);
    return true;
}

export async function speakTextWithAvatar(head, text, voice = "ped", lang = "th-TH", onTextUpdate = null) {
    const h = getActiveHead(head);
    if (!text) return;

    stopAllSpeech(h);

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
                playCleanAudio(h, data.audio_base64, cleanText, onTextUpdate);
                return;
            }
        }
    } catch (err) {
        addLog("TTS", "Pathumma TTS API ไม่พร้อมใช้งาน สลับใช้ Web Speech API ภาษาไทย", err.message);
    }

    // 2. Fallback to Web Speech API (th-TH)
    speakWithWebSpeechFallback(h, cleanText, lang, onTextUpdate);
}

/**
 * Play Audio cleanly using TalkingHead native speakAudio engine, Sync Visemes automatically, and stream text word-by-word
 */
async function playCleanAudio(head, audioSrc, fullText, onTextUpdate) {
    const h = getActiveHead(head);
    let audioDurationSec = 3.5;

    try {
        if (h && typeof h.speakAudio === "function") {
            const base64Clean = audioSrc.replace(/^data:audio\/\w+;base64,/, "");
            const binaryStr = window.atob(base64Clean);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const arrayBuffer = bytes.buffer;

            const audioCtx = h.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }

            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            audioDurationSec = audioBuffer.duration;

            const durationMs = audioDurationSec * 1000;

            addLog("AVATAR", `Thai viseme lip-sync ความยาว: ${audioDurationSec.toFixed(1)} วินาที`);

            // Ensure LipsyncTh processor is registered
            if (!h.lipsync) h.lipsync = {};
            if (!h.lipsync["th"]) {
                h.lipsync["th"] = new LipsyncTh();
            }

            const timings = buildWordTimings(fullText, durationMs);
            const visemeTimings = buildThaiVisemeTimings(fullText, durationMs);
            addLog("AVATAR", `เตรียม realtime mouth animation: ${visemeTimings.visemes.length} visemes`);
            addLog("AVATAR", "ส่ง audio และ viseme เข้า TalkingHead");

            h.speakAudio(
                {
                    audio: audioBuffer,
                    text: fullText,
                    words: timings.words,
                    wtimes: timings.wtimes,
                    wdurations: timings.wdurations,
                    visemes: visemeTimings.visemes,
                    vtimes: visemeTimings.vtimes,
                    vdurations: visemeTimings.vdurations
                },
                { lipsyncLang: "th" }
            );
            addLog("AVATAR", "TalkingHead รับ audio และ viseme เรียบร้อยแล้ว");

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
        const charDelay = Math.max(80, totalDurationMs / chars.length);

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
    const h = getActiveHead(head);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (h?.audioCtx && h.audioCtx.state === "suspended") {
        try { h.audioCtx.resume(); } catch (e) { }
    }

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

        const calculatedDuration = Math.max(2000, Array.from(text).length * 120);
        startThaiMouthAnimation(h, calculatedDuration, text);
    };

    utterance.onend = utterance.onerror = () => {
        stopAllSpeech(h);
        if (onTextUpdate) {
            onTextUpdate(text);
        }
    };

    // Chrome Web Speech safety timeout to clear previous queue
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        try { window.speechSynthesis.cancel(); } catch (e) { }
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 50);
    } else {
        window.speechSynthesis.speak(utterance);
    }
}
