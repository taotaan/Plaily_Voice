import { useState } from "react";

function getActiveHead(head) {
    return head || (typeof window !== "undefined" ? window.medfonHead : null);
}

/**
 * Execute 3D Avatar gestures (wave, nod, think, welcome) on TalkingHead engine
 */
export function playAvatarGesture(head, gestureName = "nod", mood = "happy") {
    const activeHead = getActiveHead(head);
    if (!activeHead) return;

    try {
        if (activeHead.setMood && typeof activeHead.setMood === "function") {
            activeHead.setMood(mood);
        }

        if (activeHead.audioCtx && activeHead.audioCtx.state === "suspended") {
            try { activeHead.audioCtx.resume(); } catch (e) { }
        }

        if (gestureName === "wave") {
            if (typeof activeHead.playGesture === "function") {
                activeHead.playGesture("handup");
            } else if (typeof activeHead.speakEmoji === "function") {
                activeHead.speakEmoji("👋");
            }
        } else if (gestureName === "think") {
            if (typeof activeHead.playGesture === "function") {
                activeHead.playGesture("shrug");
            } else if (typeof activeHead.speakEmoji === "function") {
                activeHead.speakEmoji("🤔");
            }
        } else if (gestureName === "welcome" || gestureName === "wai") {
            if (typeof activeHead.playGesture === "function") {
                activeHead.playGesture("namaste");
            } else if (typeof activeHead.speakEmoji === "function") {
                activeHead.speakEmoji("🙏");
            }
        } else if (gestureName === "nod" || gestureName === "happy") {
            if (typeof activeHead.speakEmoji === "function") {
                activeHead.speakEmoji("😊");
            }
        }
    } catch (err) {
        console.warn("Avatar gesture execution warning:", err);
    }
}

function AvatarControls({ head, morphKeys = [] }) {
    const [activeTab, setActiveTab] = useState("camera");

    const setCameraView = (viewName) => {
        const activeHead = getActiveHead(head);
        if (!activeHead) return;
        if (activeHead.audioCtx && activeHead.audioCtx.state === "suspended") {
            try { activeHead.audioCtx.resume(); } catch (e) { }
        }
        if (typeof activeHead.setView === "function") {
            activeHead.setView(viewName);
        }
        if (activeHead.controls) {
            try { activeHead.controls.update(); } catch (e) { }
        }
    };

    const triggerMorphKey = (key) => {
        const activeHead = getActiveHead(head);
        if (!activeHead) return;
        try {
            if (activeHead.audioCtx && activeHead.audioCtx.state === "suspended") {
                try { activeHead.audioCtx.resume(); } catch (e) { }
            }

            if (typeof activeHead.setFixedValue === "function") {
                activeHead.setFixedValue(key, 1.0);
            }

            const lowerKey = key.toLowerCase();
            if (activeHead.scene) {
                activeHead.scene.traverse((obj) => {
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
                if (typeof activeHead.setFixedValue === "function") {
                    activeHead.setFixedValue(key, null);
                }
                if (activeHead.scene) {
                    activeHead.scene.traverse((obj) => {
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
