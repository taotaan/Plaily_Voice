import { addLog } from "./logger";
import { LipsyncTh } from "../modules/lipsync-th";

const BACKEND_API_URL = "http://localhost:8000";
const VISEME_IDS = ["aa", "E", "I", "O", "U", "PP", "SS", "TH", "DD", "FF", "kk", "nn", "RR", "CH", "sil"];
const VISEME_MORPH_KEYS = VISEME_IDS.map((id) => `viseme_${id}`);
const VISEME_FALLBACK_KEYS = {
    aa: ["Fcl_MTH_A", "jawOpen"],
    E: ["Fcl_MTH_E", "jawOpen"],
    I: ["Fcl_MTH_I"],
    O: ["Fcl_MTH_O", "jawOpen"],
    U: ["Fcl_MTH_U"],
    PP: ["mouthClose", "Fcl_MTH_Close"],
    FF: ["mouthFunnel"],
    TH: ["jawOpen"],
    DD: ["Fcl_MTH_A"],
    kk: ["Fcl_MTH_A"],
    nn: ["Fcl_MTH_A"],
    RR: ["Fcl_MTH_A"],
    CH: ["Fcl_MTH_E"],
    SS: ["Fcl_MTH_I"],
    sil: []
};
const MANUAL_MOUTH_MORPH_KEYS = [
    ...VISEME_MORPH_KEYS,
    ...new Set(Object.values(VISEME_FALLBACK_KEYS).flat())
];

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
export function stopAllSpeech(head) {
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
    resetMouthMorphs(head);
}

function resetMouthMorphs(head) {
    if (!head) return;
    if (typeof head.setFixedValue === "function") {
        const resetKeys = [
            ...VISEME_MORPH_KEYS,
            "jawOpen",
            "mouthClose",
            "mouthFunnel",
            "mouthPucker",
            "Fcl_MTH_A",
            "Fcl_MTH_I",
            "Fcl_MTH_U",
            "Fcl_MTH_E",
            "Fcl_MTH_O",
            "Fcl_MTH_Close"
        ];
        resetKeys.forEach((key) => head.setFixedValue(key, null));
    }
    if (head.scene) {
        head.scene.traverse((obj) => {
            if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                for (const [key, idx] of Object.entries(obj.morphTargetDictionary)) {
                    const lowerKey = key.toLowerCase();
                    if (
                        lowerKey.includes("jaw") ||
                        lowerKey.includes("mth") ||
                        lowerKey.includes("mouth") ||
                        lowerKey.includes("viseme")
                    ) {
                        obj.morphTargetInfluences[idx] = 0;
                    }
                }
            }
        });
    }
}

function setMorphValue(head, key, value) {
    if (!head) return;
    const nextValue = value || 0;

    if (head.mtAvatar && head.mtAvatar[key]) {
        Object.assign(head.mtAvatar[key], {
            fixed: null,
            system: null,
            realtime: null,
            newvalue: nextValue,
            needsUpdate: true
        });
    }

    if (head.scene) {
        const lowerKey = key.toLowerCase();
        head.scene.traverse((obj) => {
            if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                // 1. Direct exact match
                const idx = obj.morphTargetDictionary[key];
                if (idx !== undefined) {
                    obj.morphTargetInfluences[idx] = nextValue;
                    return;
                }

                // 2. Fallback case-insensitive or substring match
                for (const [mName, mIdx] of Object.entries(obj.morphTargetDictionary)) {
                    const lName = mName.toLowerCase();
                    if (
                        lName === lowerKey ||
                        lName.endsWith(`_${lowerKey}`) ||
                        lName.endsWith(`.${lowerKey}`) ||
                        (lowerKey === "jawopen" && (lName.includes("jaw") || lName.includes("open")))
                    ) {
                        obj.morphTargetInfluences[mIdx] = nextValue;
                    }
                }
            }
        });
    }
}

function applyMouthPose(head, activeViseme, amount) {
    if (!head) return;

    MANUAL_MOUTH_MORPH_KEYS.forEach((key) => setMorphValue(head, key, 0));

    const activeKey = `viseme_${activeViseme}`;
    if (activeViseme && activeViseme !== "sil") {
        setMorphValue(head, activeKey, amount);
        (VISEME_FALLBACK_KEYS[activeViseme] || []).forEach((key) => {
            const fallbackAmount = key === "jawOpen" ? amount * 0.55 : amount * 0.75;
            setMorphValue(head, key, fallbackAmount);
        });
    }
}

function startManualVisemeSync(head, visData, durationMs) {
    if (!head || !visData || !visData.visemes.length) return;

    if (window.currentMedfonAnimationFrame) {
        cancelAnimationFrame(window.currentMedfonAnimationFrame);
        window.currentMedfonAnimationFrame = null;
    }

    const startedAt = performance.now();
    const leadMs = 35;

    const animate = () => {
        const elapsed = performance.now() - startedAt;

        if (elapsed >= durationMs + 120) {
            resetMouthMorphs(head);
            window.currentMedfonAnimationFrame = null;
            return;
        }

        let activeViseme = "sil";
        let amount = 0;

        for (let i = 0; i < visData.visemes.length; i++) {
            const start = Math.max(0, visData.times[i] - leadMs);
            const duration = Math.max(1, visData.durations[i]);
            const end = start + duration + leadMs;

            if (elapsed >= start && elapsed <= end) {
                const progress = Math.min(1, Math.max(0, (elapsed - start) / duration));
                activeViseme = visData.visemes[i];
                amount = activeViseme === "sil" ? 0 : 0.25 + 0.65 * Math.sin(progress * Math.PI);
                break;
            }
        }

        applyMouthPose(head, activeViseme, amount);
        window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
    };

    window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
}

function startRhythmicMouthAnimation(head, shouldContinue) {
    if (!head) return;

    const startedAt = performance.now();
    const animate = () => {
        if (!shouldContinue()) {
            resetMouthMorphs(head);
            window.currentMedfonAnimationFrame = null;
            return;
        }

        const elapsed = (performance.now() - startedAt) / 1000;
        const amount = 0.2 + 0.7 * Math.abs(Math.sin(elapsed * 14) * Math.cos(elapsed * 6));
        applyMouthPose(head, "aa", amount);
        window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
    };

    window.currentMedfonAnimationFrame = requestAnimationFrame(animate);
}

function buildVisemeDataForText(text, durationMs) {
    const timing = pathummaWordTimings(text, durationMs);
    const lipsyncThProcessor = new LipsyncTh();
    const visData = { visemes: [], times: [], durations: [] };

    timing.words.forEach((word, i) => {
        const parsedWord = lipsyncThProcessor.preProcessText(word);
        const wordVisemes = lipsyncThProcessor.wordsToVisemes(parsedWord);
        if (!wordVisemes.visemes.length) return;

        const wordStart = timing.wtimes[i];
        const wordDuration = timing.wdurations[i];
        const wordVisemeDuration = wordVisemes.times[wordVisemes.times.length - 1] + wordVisemes.durations[wordVisemes.durations.length - 1];
        const scale = wordVisemeDuration > 0 ? wordDuration / wordVisemeDuration : 1;

        wordVisemes.visemes.forEach((viseme, j) => {
            visData.visemes.push(viseme);
            visData.times.push(wordStart + wordVisemes.times[j] * scale);
            visData.durations.push(wordVisemes.durations[j] * scale);
        });
    });

    return {
        timing,
        visData
    };
}

function playHtmlAudioWithMouthFallback(head, audioSrc, fullText) {
    const audio = new Audio(audioSrc);
    window.currentMedfonAudio = audio;

    audio.onloadedmetadata = () => {
        if (!head) return;
        const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 3500;
        const { visData } = buildVisemeDataForText(fullText, durationMs);
        startManualVisemeSync(head, visData, durationMs);
    };

    audio.onplay = () => {
        if (!head || window.currentMedfonAnimationFrame) return;
        startRhythmicMouthAnimation(head, () => !audio.paused && !audio.ended);
    };

    audio.onended = audio.onerror = () => {
        resetMouthMorphs(head);
    };

    audio.play();
}

if (typeof window !== "undefined") {
    window.medfonDebugMouth = () => {
        const head = window.medfonHead;
        if (!head) {
            console.warn("medfonHead is not ready yet.");
            return;
        }

        let i = 0;
        const sequence = ["aa", "E", "I", "O", "U", "PP", "sil"];
        const timer = setInterval(() => {
            const viseme = sequence[i % sequence.length];
            applyMouthPose(head, viseme, viseme === "sil" ? 0 : 0.9);
            i++;
            if (i > sequence.length * 3) {
                clearInterval(timer);
                resetMouthMorphs(head);
            }
        }, 220);
    };
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

function pathummaWordTimings(text, durationMs) {
    let words;
    try {
        const segmenter = new Intl.Segmenter("th", { granularity: "word" });
        words = [...segmenter.segment(text)]
            .filter((x) => x.isWordLike || x.segment.trim().length)
            .map((x) => x.segment.trim())
            .filter(Boolean);
    } catch {
        words = text.trim().split(/\s+/).filter(Boolean);
    }
    if (!words.length) words = [text.trim()];

    const weights = words.map((x) => Math.max(1, [...x].length));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let t = 0;
    return words.reduce(
        (o, word, i) => {
            const d = (durationMs * weights[i]) / total;
            o.words.push(word);
            o.wtimes.push(t);
            o.wdurations.push(d);
            t += d;
            return o;
        },
        { words: [], wtimes: [], wdurations: [] }
    );
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
            const { timing, visData } = buildVisemeDataForText(fullText, durationMs);

            addLog("AVATAR", `เริ่มเล่นเสียงและขยับปากภาษาไทย (Visemes: ${visData.visemes.length}) ความยาว: ${audioDurationSec.toFixed(1)} วินาที`);

            head.speakAudio(
                {
                    audio: audioBuffer,
                    words: timing.words,
                    wtimes: timing.wtimes,
                    wdurations: timing.wdurations
                },
                { lipsyncLang: "th" }
            );

            startManualVisemeSync(head, visData, durationMs);
        } else {
            playHtmlAudioWithMouthFallback(head, audioSrc, fullText);
        }
    } catch (e) {
        console.warn("TalkingHead native speakAudio fallback to HTML5 Audio:", e);
        playHtmlAudioWithMouthFallback(head, audioSrc, fullText);
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

        startRhythmicMouthAnimation(head, () => typeof window !== "undefined" && window.speechSynthesis.speaking);
    };

    utterance.onend = utterance.onerror = () => {
        stopAllSpeech(head);
        if (onTextUpdate) {
            onTextUpdate(text);
        }
    };

    window.speechSynthesis.speak(utterance);
}
