import { useState, useEffect, useRef } from "react";
import { addLog } from "../../services/logger";

function ChatInput({ onSendMessage, isSending = false, isCameraOpen = false, isFaceTracking = false }) {
    const [text, setText] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [isHandsFree, setIsHandsFree] = useState(false);
    const recognitionRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const rearmTimerRef = useRef(null);
    const shouldListenRef = useRef(false);
    const isSendingRef = useRef(isSending);

    const isAutoModeActive = isCameraOpen || isFaceTracking || isHandsFree;

    // Update refs for continuous auto-rearm loop
    useEffect(() => {
        shouldListenRef.current = isAutoModeActive && !isSending;
        isSendingRef.current = isSending;
    }, [isAutoModeActive, isSending]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "th-TH";

            recognition.onstart = () => {
                setIsListening(true);
                addLog("STT", "🎤 เริ่มอัดเสียงไมโครโฟนภาษาไทย...");
            };

            recognition.onresult = (event) => {
                let transcript = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }

                if (transcript.trim()) {
                    setText(transcript);

                    // If Auto Mode / Hands-Free Mode is active, auto-send on silence pause (~1.2s)
                    if (silenceTimerRef.current) {
                        clearTimeout(silenceTimerRef.current);
                    }

                    if (shouldListenRef.current) {
                        silenceTimerRef.current = setTimeout(() => {
                            if (transcript.trim()) {
                                addLog("STT", `🤖 [Hands-Free Auto-Send] ส่งคำถามอัตโนมัติ: "${transcript.trim()}"`);
                                onSendMessage(transcript.trim());
                                setText("");
                                if (recognitionRef.current) {
                                    try { recognitionRef.current.stop(); } catch (e) { }
                                }
                            }
                        }, 1200);
                    }
                }
            };

            recognition.onerror = (event) => {
                addLog("STT", `⚠️ ข้อผิดพลาดในการอัดเสียง: ${event.error}`);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
                addLog("STT", "⏹️ การอัดเสียงพักชั่วคราว");

                // Auto-rearm if still in Video Conferencing / Hands-Free mode and AI is not currently speaking
                if (shouldListenRef.current && !isSendingRef.current) {
                    if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
                    rearmTimerRef.current = setTimeout(() => {
                        if (shouldListenRef.current && !isSendingRef.current && recognitionRef.current) {
                            try {
                                recognitionRef.current.start();
                            } catch (e) { }
                        }
                    }, 400);
                }
            };

            recognitionRef.current = recognition;
        }

        return () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
        };
    }, [onSendMessage]);

    const prevAutoModeRef = useRef(isAutoModeActive);

    // Handle trigger or stop recognition based on mode or AI sending state
    useEffect(() => {
        if (!recognitionRef.current) return;

        // When camera / hands-free mode turns OFF, stop microphone immediately
        if (prevAutoModeRef.current && !isAutoModeActive) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
            try {
                recognitionRef.current.stop();
            } catch (e) { }
            addLog("STT", "⏹️ ปิดไมโครโฟนเรียบร้อยเนื่องจากปิดกล้องแล้ว");
        } else if (isAutoModeActive && !isSending) {
            if (!isListening) {
                try {
                    recognitionRef.current.start();
                } catch (e) { }
            }
        } else if (isSending && isListening) {
            try {
                recognitionRef.current.stop();
            } catch (e) { }
        }

        prevAutoModeRef.current = isAutoModeActive;
    }, [isAutoModeActive, isSending, isListening]);


    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("เบราว์เซอร์ของคุณยังไม่รองรับระบบบันทึกเสียง Web Speech STT");
            return;
        }

        if (isListening) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            recognitionRef.current.stop();
        } else {
            setText("");
            try { recognitionRef.current.start(); } catch (e) { }
        }
    };

    const toggleHandsFree = () => {
        const nextState = !isHandsFree;
        setIsHandsFree(nextState);
        addLog("STT", nextState ? "🤖 เปิดโหมดโต้ตอบเสียงอัตโนมัติ (Hands-Free Mode)" : "⏹️ ปิดโหมดโต้ตอบเสียงอัตโนมัติ");
    };

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (!text.trim() || isSending) return;
        addLog("STT", `ส่งข้อความจากผู้ใช้: "${text.trim()}"`);
        onSendMessage(text.trim());
        setText("");
        if (recognitionRef.current && isListening) {
            try { recognitionRef.current.stop(); } catch (e) { }
        }
    };

    return (
        <div className="chat-input-wrapper">
            <div className="quick-chips-container">
                {(isCameraOpen || isFaceTracking) ? (
                    <div className="quick-chip-btn active-chip" title="ระบบเปิดกล้องโต้ตอบเสียงอัตโนมัติ">
                        โหมดเปิดกล้องโต้ตอบเสียงอัตโนมัติ
                    </div>
                ) : (
                    <button
                        type="button"
                        className={`quick-chip-btn ${isHandsFree ? "active-chip" : ""}`}
                        onClick={toggleHandsFree}
                        title="เมื่อหยุดพูด ระบบจะส่งข้อความไปประมวลผลอัตโนมัติ"
                    >
                        {isHandsFree ? "โหมดโต้ตอบเสียงอัตโนมัติ (เปิดอยู่)" : "โหมดโต้ตอบเสียงอัตโนมัติ"}
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="chat-input-form">
                <button
                    type="button"
                    className={`stt-mic-btn ${isListening ? "listening-active" : ""}`}
                    onClick={toggleListening}
                    title={isListening ? "กำลังบันทึกเสียงพูดของคุณ..." : "กดเพื่อบันทึกเสียง"}
                    disabled={isSending}
                >
                    {isListening ? "กำลังฟังเสียง..." : "บันทึกเสียง"}
                </button>

                <input
                    type="text"
                    className="chat-text-field"
                    placeholder={isListening ? (isAutoModeActive ? "พูดข้อความ ระบบจะส่งให้อัตโนมัติเมื่อหยุดพูด..." : "กำลังบันทึกเสียงพูดของคุณ...") : "พิมพ์ข้อความ หรือใช้การพูด..."}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={isSending}
                />

                <button type="submit" className="chat-send-btn" disabled={!text.trim() || isSending}>
                    {isSending ? "กำลังส่ง..." : "ส่งข้อความ"}
                </button>
            </form>
        </div>
    );
}

export default ChatInput;


