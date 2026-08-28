import { useState, useEffect, useRef } from "react";
import { addLog } from "../../services/logger";

function ChatInput({ onSendMessage, isSending = false }) {
    const [text, setText] = useState("");
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
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
                setText(transcript);
            };

            recognition.onerror = (event) => {
                addLog("STT", `⚠️ ข้อผิดพลาดในการอัดเสียง: ${event.error}`);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
                addLog("STT", "⏹️ การอัดเสียงสิ้นสุดลง");
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("เบราว์เซอร์ของคุณยังไม่รองรับระบบบันทึกเสียง Web Speech STT");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            setText("");
            recognitionRef.current.start();
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!text.trim() || isSending) return;
        addLog("STT", `ส่งข้อความจากผู้ใช้: "${text.trim()}"`);
        onSendMessage(text.trim());
        setText("");
    };

    const handleQuickQuestion = (qText) => {
        if (isSending) return;
        addLog("STT", `เลือกคำถามด่วน: "${qText}"`);
        onSendMessage(qText);
    };

    const quickQuestions = [
        "สวัสดีค่ะ ขอแนะนำตัวเองหน่อยค่ะ",
        "วันนี้วันที่ 28/08/2569 คือวันอะไร",
        "ขอคำแนะนำการดูแลสุขภาพเบื้องต้น"
    ];

    return (
        <div className="chat-input-wrapper">
            <div className="quick-chips-container">
                {quickQuestions.map((q, idx) => (
                    <button
                        key={idx}
                        className="quick-chip-btn"
                        onClick={() => handleQuickQuestion(q)}
                        disabled={isSending}
                    >
                        💡 {q}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="chat-input-form">
                <button
                    type="button"
                    className={`stt-mic-btn ${isListening ? "listening-active" : ""}`}
                    onClick={toggleListening}
                    title={isListening ? "กำลังฟังเสียงพูดของคุณ..." : "กดเพื่อพูดผ่านไมโครโฟน"}
                    disabled={isSending}
                >
                    {isListening ? "🔴 กำลังฟัง..." : "🎤 อัดเสียง"}
                </button>

                <input
                    type="text"
                    className="chat-text-field"
                    placeholder={isListening ? "กำลังฟังเสียงพูดของคุณ..." : "พิมพ์ข้อความ หรือกดปุ่มไมโครโฟนอัดเสียง..."}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={isSending}
                />

                <button type="submit" className="chat-send-btn" disabled={!text.trim() || isSending}>
                    {isSending ? "กำลังส่ง..." : "ส่งข้อความ 🚀"}
                </button>
            </form>
        </div>
    );
}

export default ChatInput;
