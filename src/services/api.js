import { addLog } from "./logger";

const API_BASE_URL = "http://localhost:8000";

/**
 * Check backend service status
 */
export async function checkBackendHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.warn("Backend API is offline, using frontend offline mode.");
        return null;
    }
}

/**
 * Send chat message to Medfon FastAPI Backend
 * @param {string} message 
 */
export async function sendChatMessage(message) {
    addLog("LLM", `ส่งข้อความไปประมวลผลคำตอบจาก LLM (Pathumma TokenMind)`, `User Query: "${message}"`);

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        addLog("LLM", `🤖 ตอบกลับสำเร็จจาก ${data.source}`, `Reply: "${data.reply}" | Gesture: ${data.gesture || "nod"} | Mood: ${data.mood || "happy"}`);
        return data;
    } catch (error) {
        addLog("LLM", "⚠️ ข้อผิดพลาดในการเชื่อมต่อ LLM Backend API", error.message);
        throw error;
    }
}
