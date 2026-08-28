import { addLog } from "./logger";

const BACKEND_API_URL = "http://localhost:8000";

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
        } catch (e) {}
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
        } catch (e) {}
    }
    if (head && typeof head.setFixedValue === "function") {
        const resetKeys = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U", "jawOpen", "Fcl_MTH_A", "Fcl_MTH_E", "Fcl_MTH_O"];
        resetKeys.forEach((key) => head.setFixedValue(key, null));
    }
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
 * Play Audio cleanly using HTML5 Audio Element, Sync Visemes, and stream text word-by-word
 */
function playCleanAudio(head, audioSrc, fullText, onTextUpdate) {
    const audio = new Audio(audioSrc);
    window.currentMedfonAudio = audio;

    const visemeAnimKeys = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"];
    const fallbackDirectKeys = ["jawOpen", "Fcl_MTH_A", "Fcl_MTH_E", "Fcl_MTH_O"];

    audio.onloadedmetadata = () => {
        addLog("AVATAR", `เริ่มเล่นเสียงตอบกลับ ความยาว: ${audio.duration.toFixed(1)} วินาที`);
    };

    audio.onplay = () => {
        addLog("AVATAR", "3D Avatar เริ่มขยับปากขยับใบหน้าตามจังหวะเสียงพากย์");

        // 1. Word-by-Word Synchronized Typing Animation
        if (onTextUpdate) {
            const chars = Array.from(fullText);
            const totalDurationMs = (audio.duration || 3.5) * 1000;
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

        // 2. Viseme 3D Mouth Lip-Sync Animation
        if (head && typeof head.setFixedValue === "function") {
            let step = 0;
            window.currentMedfonInterval = setInterval(() => {
                const visKey = visemeAnimKeys[step % visemeAnimKeys.length];
                const directKey = fallbackDirectKeys[step % fallbackDirectKeys.length];

                // Trigger TalkingHead Viseme animation
                head.setFixedValue(visKey, 1.0);
                head.setFixedValue(directKey, 0.85);

                // Direct scene mesh morph influence fallback
                if (head.scene) {
                    head.scene.traverse((obj) => {
                        if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                            const jawIdx = obj.morphTargetDictionary["jawOpen"];
                            if (jawIdx !== undefined) {
                                obj.morphTargetInfluences[jawIdx] = step % 2 === 0 ? 0.8 : 0.2;
                            }
                            const mthIdx = obj.morphTargetDictionary["Fcl_MTH_A"];
                            if (mthIdx !== undefined) {
                                obj.morphTargetInfluences[mthIdx] = step % 2 === 0 ? 0.9 : 0.3;
                            }
                        }
                    });
                }

                setTimeout(() => {
                    head.setFixedValue(visKey, null);
                    head.setFixedValue(directKey, null);
                }, 120);

                step++;
            }, 150);
        }
    };

    audio.onended = audio.onerror = () => {
        addLog("AVATAR", "การเล่นเสียงและการขยับปากสิ้นสุดลงแล้ว");
        if (window.currentMedfonInterval) {
            clearInterval(window.currentMedfonInterval);
            window.currentMedfonInterval = null;
        }
        if (window.currentTypewriterInterval) {
            clearInterval(window.currentTypewriterInterval);
            window.currentTypewriterInterval = null;
        }
        if (onTextUpdate) {
            onTextUpdate(fullText);
        }
        if (head && typeof head.setFixedValue === "function") {
            [...visemeAnimKeys, ...fallbackDirectKeys].forEach((key) => head.setFixedValue(key, null));
            if (head.scene) {
                head.scene.traverse((obj) => {
                    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                        const jawIdx = obj.morphTargetDictionary["jawOpen"];
                        if (jawIdx !== undefined) obj.morphTargetInfluences[jawIdx] = 0;
                        const mthIdx = obj.morphTargetDictionary["Fcl_MTH_A"];
                        if (mthIdx !== undefined) obj.morphTargetInfluences[mthIdx] = 0;
                    }
                });
            }
        }
    };

    audio.play().catch((err) => {
        addLog("TTS", "Audio playback blocked by browser, trying Web Speech fallback", err.message);
        speakWithWebSpeechFallback(head, fullText, "th-TH", onTextUpdate);
    });
}

/**
 * Web Speech API Fallback (th-TH) with synchronized typing animation
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

    const visemeAnimKeys = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"];
    const fallbackDirectKeys = ["jawOpen", "Fcl_MTH_A", "Fcl_MTH_E", "Fcl_MTH_O"];

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

        if (head && typeof head.setFixedValue === "function") {
            let step = 0;
            window.currentMedfonInterval = setInterval(() => {
                const visKey = visemeAnimKeys[step % visemeAnimKeys.length];
                const directKey = fallbackDirectKeys[step % fallbackDirectKeys.length];

                head.setFixedValue(visKey, 1.0);
                head.setFixedValue(directKey, 0.85);

                if (head.scene) {
                    head.scene.traverse((obj) => {
                        if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                            const jawIdx = obj.morphTargetDictionary["jawOpen"];
                            if (jawIdx !== undefined) {
                                obj.morphTargetInfluences[jawIdx] = step % 2 === 0 ? 0.8 : 0.2;
                            }
                            const mthIdx = obj.morphTargetDictionary["Fcl_MTH_A"];
                            if (mthIdx !== undefined) {
                                obj.morphTargetInfluences[mthIdx] = step % 2 === 0 ? 0.9 : 0.3;
                            }
                        }
                    });
                }

                setTimeout(() => {
                    head.setFixedValue(visKey, null);
                    head.setFixedValue(directKey, null);
                }, 120);

                step++;
            }, 150);
        }
    };

    utterance.onend = utterance.onerror = () => {
        if (window.currentMedfonInterval) {
            clearInterval(window.currentMedfonInterval);
            window.currentMedfonInterval = null;
        }
        if (window.currentTypewriterInterval) {
            clearInterval(window.currentTypewriterInterval);
            window.currentTypewriterInterval = null;
        }
        if (onTextUpdate) {
            onTextUpdate(text);
        }
        if (head && typeof head.setFixedValue === "function") {
            [...visemeAnimKeys, ...fallbackDirectKeys].forEach((key) => head.setFixedValue(key, null));
        }
    };

    window.speechSynthesis.speak(utterance);
}
