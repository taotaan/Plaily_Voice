import { useState } from "react";

/**
 * Execute 3D Avatar gestures (wave, nod, think, welcome) on TalkingHead engine
 */
export function playAvatarGesture(head, gestureName = "nod", mood = "happy") {
    if (!head) return;

    try {
        // 1. Play emotion mood
        if (head.setMood && typeof head.setMood === "function") {
            head.setMood(mood);
        }

        // 2. Play 3D gestures based on function calling key
        if (gestureName === "wave") {
            if (typeof head.speakEmoji === "function") head.speakEmoji("👋");
        } else if (gestureName === "think") {
            if (typeof head.speakEmoji === "function") head.speakEmoji("🤔");
        } else if (gestureName === "welcome" || gestureName === "wai") {
            if (typeof head.speakEmoji === "function") head.speakEmoji("🙏");
        } else if (gestureName === "nod" || gestureName === "happy") {
            if (typeof head.speakEmoji === "function") head.speakEmoji("😊");
        }
    } catch (err) {
        console.warn("Avatar gesture execution warning:", err);
    }
}

function AvatarControls({ head, morphKeys = [] }) {
    const [activeTab, setActiveTab] = useState("camera");

    const setCameraView = (viewName) => {
        if (head && typeof head.setView === "function") {
            head.setView(viewName);
        }
    };

    const triggerMorphKey = (key) => {
        if (!head) return;
        try {
            head.setFixedValue(key, 1.0);
            if (head.scene) {
                head.scene.traverse((obj) => {
                    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                        const idx = obj.morphTargetDictionary[key];
                        if (idx !== undefined) {
                            obj.morphTargetInfluences[idx] = 1.0;
                        }
                    }
                });
            }

            setTimeout(() => {
                head.setFixedValue(key, null);
                if (head.scene) {
                    head.scene.traverse((obj) => {
                        if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                            const idx = obj.morphTargetDictionary[key];
                            if (idx !== undefined) {
                                obj.morphTargetInfluences[idx] = 0;
                            }
                        }
                    });
                }
            }, 1200);
        } catch (e) {
            console.error("Morph test failed:", e);
        }
    };

    const quickMouthKeys = ["jawOpen", "mouthSmileLeft", "mouthSmileRight", "Fcl_MTH_A", "Fcl_MTH_I", "Fcl_MTH_O", "Fcl_MTH_Large"];

    return (
        <div className="avatar-controls-card">
            <div className="controls-tab-header">
                <button
                    className={`tab-btn ${activeTab === "camera" ? "active" : ""}`}
                    onClick={() => setActiveTab("camera")}
                >
                    🎥 มุมกล้อง & ท่าทาง
                </button>
                <button
                    className={`tab-btn ${activeTab === "mouth" ? "active" : ""}`}
                    onClick={() => setActiveTab("mouth")}
                >
                    👄 ทดสอบรูปปาก
                </button>
                <button
                    className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                    onClick={() => setActiveTab("all")}
                >
                    🧬 Morph Keys ({morphKeys.length})
                </button>
            </div>

            <div className="controls-tab-body">
                {activeTab === "camera" && (
                    <div className="btn-group">
                        <button className="ctrl-btn teal" onClick={() => setCameraView("head")}>
                            🔍 ใบหน้า (Head)
                        </button>
                        <button className="ctrl-btn teal" onClick={() => setCameraView("upper")}>
                            🔍 ครึ่งตัว (Upper)
                        </button>
                        <button className="ctrl-btn teal" onClick={() => setCameraView("full")}>
                            🔍 เต็มตัว (Full)
                        </button>
                        <button className="ctrl-btn green" onClick={() => playAvatarGesture(head, "wave")}>
                            👋 โบกมือ
                        </button>
                        <button className="ctrl-btn orange" onClick={() => playAvatarGesture(head, "think")}>
                            🤔 ครุ่นคิด
                        </button>
                        <button className="ctrl-btn pink" onClick={() => playAvatarGesture(head, "welcome")}>
                            🙏 ทักทาย
                        </button>
                    </div>
                )}

                {activeTab === "mouth" && (
                    <div className="btn-group">
                        {quickMouthKeys.map((k) => (
                            <button
                                key={k}
                                className="ctrl-btn pink"
                                onClick={() => triggerMorphKey(k)}
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                )}

                {activeTab === "all" && (
                    <div className="morph-keys-scroll shadow-inner">
                        {morphKeys.map((key) => (
                            <button
                                key={key}
                                className={`morph-chip ${
                                    key.startsWith("viseme") || key.includes("mouth") || key.includes("MTH") || key.includes("jaw")
                                        ? "highlight"
                                        : ""
                                }`}
                                onClick={() => triggerMorphKey(key)}
                            >
                                {key}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AvatarControls;
