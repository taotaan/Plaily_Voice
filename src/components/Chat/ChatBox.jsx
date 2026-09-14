import { useEffect, useRef } from "react";

function ChatBox({ messages = [] }) {
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="chat-box-container">
            <div className="chat-messages-list">
                {messages.length === 0 ? (
                    <div className="chat-empty-state">
                        <h4>ยินดีต้อนรับสู่ระบบผู้ช่วยเสมือน ปลายลี่</h4>
                        <p>พิมพ์ข้อความสนทนาเพื่อเริ่มต้นพูดคุยกับปลายลี่</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`chat-bubble-wrapper ${msg.sender === "user" ? "user-side" : "bot-side"}`}
                        >
                            <div className="avatar-badge">
                                {msg.sender === "user" ? "คุณ" : "PL"}
                            </div>
                            <div className="chat-bubble">
                                <div className="sender-name">
                                    {msg.sender === "user" ? "คุณ" : "ปลายลี่"}
                                </div>
                                <div className="message-content">{msg.text}</div>
                                <div className="message-time">{msg.time}</div>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}

export default ChatBox;

