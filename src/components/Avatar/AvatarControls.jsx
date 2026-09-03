import { useState } from "react";

/**
 * Execute 3D Avatar gestures (wave, nod, think, welcome) on TalkingHead engine
 */
export function playAvatarGesture(head, gestureName = "nod", mood = "happy") {
    if (!head) return;

    try {
        if (head.setMood && typeof head.setMood === "function") {
            head.setMood(mood);
        }

        if (head.audioCtx && head.audioCtx.state === "suspended") {
            try { head.audioCtx.resume(); } catch (e) { }
        }

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
        if (!head) return;
        if (head.audioCtx && head.audioCtx.state === "suspended") {
            try { head.audioCtx.resume(); } catch (e) {}
        }
        if (typeof head.setView === "function") {
            head.setView(viewName);
        }
    };

    const triggerMorphKey = (key) => {
        if (!head) return;
        try {
            if (head.audioCtx && head.audioCtx.state === "suspended") {
                try { head.audioCtx.resume(); } catch (e) {}
            }

            if (typeof head.setFixedValue === "function") {
                head.setFixedValue(key, 1.0);
            }

            const lowerKey = key.toLowerCase();
            if (head.scene) {
                head.scene.traverse((obj) => {
                    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                        let idx = obj.morphTargetDictionary[key];
                        if (idx === undefined) {
                            for (const [mName, mIdx] of Object.entries(obj.morphTargetDictionary)) {
                                if (mName.toLowerCase() === lowerKey) {
                                    idx = mIdx;
                                    break;
                                }
                            }
                        }
                        if (idx !== undefined) {
                            obj.morphTargetInfluences[idx] = 1.0;
                        }
                    }
                });
            }

            setTimeout(() => {
                if (typeof head.setFixedValue === "function") {
                    head.setFixedValue(key, null);
                }
                if (head.scene) {
                    head.scene.traverse((obj) => {
                        if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
                            let idx = obj.morphTargetDictionary[key];
                            if (idx === undefined) {
                                for (const [mName, mIdx] of Object.entries(obj.morphTargetDictionary)) {
                                    if (mName.toLowerCase() === lowerKey) {
                                        idx = mIdx;
                                        break;
                                    }
                                }
                            }
                            if (idx !== undefined) {
                                obj.morphTargetInfluences[idx] = 0;
                            }
                        }
                    });
                }
            }, 2000);
        } catch (e) {
            console.error("Morph test failed:", e);
        }
    };

    const mouthRelatedKeys = morphKeys.filter((k) => {
        const lk = k.toLowerCase();
        return (
            lk.includes("mouth") ||
            lk.includes("jaw") ||
            lk.includes("mth") ||
            lk.includes("viseme") ||
            lk.includes("v_") ||
            lk.includes("lip") ||
            lk.includes("smile")
        );
    });

    const displayMouthKeys =
        mouthRelatedKeys.length > 0
            ? mouthRelatedKeys.slice(0, 16)
            : ["jawOpen", "mouthSmileLeft", "mouthSmileRight", "Fcl_MTH_A", "Fcl_MTH_I", "Fcl_MTH_O", "Fcl_MTH_Large"];

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
                    👄 ทดสอบรูปปาก ({displayMouthKeys.length})
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
                        {displayMouthKeys.map((k) => (
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
                                className={`morph-chip ${key.startsWith("viseme") || key.includes("mouth") || key.includes("MTH") || key.includes("jaw")
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
