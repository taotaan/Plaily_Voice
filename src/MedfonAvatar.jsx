import { useState } from "react";
import MedfonAvatarCanvas from "./components/Avatar/MedfonAvatarCanvas";
import AvatarControls, { playAvatarGesture } from "./components/Avatar/AvatarControls";
import ChatBox from "./components/Chat/ChatBox";
import ChatInput from "./components/Chat/ChatInput";
import { sendChatMessage } from "./services/api";
import { speakTextWithAvatar } from "./services/tts";
import { addLog } from "./services/logger";

function MedfonAvatar() {
    const [headInstance, setHeadInstance] = useState(null);
    const [morphKeys, setMorphKeys] = useState([]);
    const [messages, setMessages] = useState([
        {
            id: 1,
            sender: "bot",
            text: "สวัสดีครับ คุณ! ผมคือ ปลายลี่ ผู้ช่วยเสมือนภาษาไทย ยินดีที่ได้พบครับ มีเรื่องอะไรให้ปลายลี่ดูแลช่วยเหลือวันนี้ไหมครับ?",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
    ]);
    const [isSending, setIsSending] = useState(false);

    const handleAvatarLoaded = (head, morphs = []) => {
        setHeadInstance(head);
        let keys = morphs;
        if ((!keys || keys.length === 0) && head && head.mtAvatar) {
            keys = Object.keys(head.mtAvatar);
        }
        setMorphKeys(keys);
        addLog("AVATAR", `3D Avatar Engine (TalkingHead) โหลดสำเร็จ (พบ ${keys.length} Morph Keys)`);
    };

    const handleSendMessage = async (userText) => {
        const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const userMsgObj = {
            id: Date.now(),
            sender: "user",
            text: userText,
            time: timeNow
        };

        setMessages((prev) => [...prev, userMsgObj]);
        setIsSending(true);

        try {
            // Stage 2: Fetch LLM response
            const apiRes = await sendChatMessage(userText);
            const botReplyText = apiRes.reply || "ขออภัยครับ ปลายลี่ไม่สามารถดึงข้อมูลได้ในขณะนี้";
            const botGesture = apiRes.gesture || "nod";
            const botMood = apiRes.mood || "happy";

            const botMsgId = Date.now() + 1;

            // Add placeholder bot message for typewriter streaming
            const botMsgObj = {
                id: botMsgId,
                sender: "bot",
                text: "", // Starts empty, fills word-by-word with speech sound
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            };

            setMessages((prev) => [...prev, botMsgObj]);

            // Stage 4: Trigger 3D Avatar Gestures & Emotions
            playAvatarGesture(headInstance, botGesture, botMood);

            // Stage 3 & 4: Trigger Pathumma TTS Audio with Synchronized Word-by-Word Typing
            speakTextWithAvatar(headInstance, botReplyText, "ped", "th-TH", (partialText) => {
                setMessages((prev) =>
                    prev.map((m) => (m.id === botMsgId ? { ...m, text: partialText } : m))
                );
            });
        } catch (error) {
            console.error("Chat error:", error);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="medfon-main-wrapper">
            <div className="medfon-feature-grid">
                {/* Left Panel: 3D Avatar & View Controls */}
                <div className="avatar-panel">
                    <div className="panel-card glass-morphism">
                        <div className="panel-header">
                            <h3>🩺 3D Avatar (ปลายลี่)</h3>
                            <span className="status-badge online">● พร้อมใช้งาน</span>
                        </div>

                        <MedfonAvatarCanvas onAvatarLoaded={handleAvatarLoaded} />

                        <AvatarControls head={headInstance} morphKeys={morphKeys} />
                    </div>
                </div>

                {/* Right Panel: AI Chat Interface */}
                <div className="chat-panel">
                    <div className="panel-card glass-morphism">
                        <div className="panel-header">
                            <h3>💬 สนทนากับ ปลายลี่ AI</h3>
                            <span className="info-badge">ตอบพิมพ์ตามเสียง & Lip-sync</span>
                        </div>

                        <ChatBox messages={messages} />

                        <ChatInput onSendMessage={handleSendMessage} isSending={isSending} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MedfonAvatar;
