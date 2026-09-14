import { useState, useEffect } from "react";
import { startFaceTracker, stopFaceTracker, openWebcamStream } from "../../services/faceTracker";

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

function AvatarControls({
    head,
    morphKeys = [],
    videoRef,
    isCameraOpen,
    setIsCameraOpen,
    isFaceTracking,
    setIsFaceTracking,
    trackerStatus,
    setTrackerStatus,
    currentView,
    setCurrentView
}) {
    const [activeTab, setActiveTab] = useState("camera");

    const toggleWebcam = async () => {
        if (isCameraOpen) {
            if (!isFaceTracking) {
                stopFaceTracker();
            }
            if (setIsCameraOpen) setIsCameraOpen(false);
            if (setTrackerStatus) setTrackerStatus("");
        } else {
            try {
                if (setTrackerStatus) setTrackerStatus("กำลังขอสิทธิ์เปิดกล้อง...");
                const targetVid = videoRef ? videoRef.current : null;
                await openWebcamStream(targetVid);
                if (setIsCameraOpen) setIsCameraOpen(true);
                if (setTrackerStatus) setTrackerStatus("🎥 เปิดกล้องคุยสดเรียบร้อย (พูดคุยโต้ตอบได้ทันที)");
            } catch (err) {
                console.error("Webcam open error:", err);
                if (setTrackerStatus) setTrackerStatus(`⚠️ ${err.message || "ไม่สามารถเปิดกล้องได้"}`);
                if (setIsCameraOpen) setIsCameraOpen(false);
            }
        }
    };

    const toggleFaceTracking = async () => {
        if (isFaceTracking) {
            stopFaceTracker();
            if (setIsFaceTracking) setIsFaceTracking(false);
            if (setTrackerStatus) setTrackerStatus(isCameraOpen ? "🎥 เปิดกล้องคุยสด" : "");
            const activeHead = getActiveHead(head);
            if (activeHead && typeof activeHead.setValue === "function") {
                activeHead.setValue("headRotateY", 0);
                activeHead.setValue("headRotateX", 0);
            }
        } else {
            try {
                if (setTrackerStatus) setTrackerStatus("กำลังเตรียมระบบสบตา...");
                const targetVid = videoRef ? videoRef.current : null;
                await startFaceTracker(targetVid, ({ yaw, pitch, detected }) => {
                    const activeHead = getActiveHead(head);
                    if (activeHead) {
                        if (detected) {
                            if (typeof activeHead.setValue === "function") {
                                activeHead.setValue("headRotateY", yaw * 0.4);
                                activeHead.setValue("headRotateX", pitch * 0.3);
                            }
                            if (setTrackerStatus) setTrackerStatus("👁️ กำลังสบตากับคุณ");
                        } else {
                            if (typeof activeHead.setValue === "function") {
                                activeHead.setValue("headRotateY", 0);
                                activeHead.setValue("headRotateX", 0);
                            }
                            if (setTrackerStatus) setTrackerStatus("🔍 กำลังมองหาใบหน้า...");
                        }
                    }
                });
                if (setIsFaceTracking) setIsFaceTracking(true);
                if (setIsCameraOpen) setIsCameraOpen(true);
            } catch (err) {
                console.error("Face tracker error:", err);
                if (setTrackerStatus) setTrackerStatus(`⚠️ ${err.message || "ไม่สามารถเปิดระบบสบตาได้"}`);
                if (setIsFaceTracking) setIsFaceTracking(false);
            }
        }
    };

    useEffect(() => {
        return () => {
            stopFaceTracker();
        };
    }, []);


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
                        <button
                            className={`ctrl-btn ${isCameraOpen ? "pink" : "green"}`}
                            onClick={toggleWebcam}
                        >
                            {isCameraOpen ? "🎥 ⏹️ ปิดกล้อง" : "🎥 เปิดกล้องคุยสด"}
                        </button>
                        <button
                            className={`ctrl-btn ${isFaceTracking ? "orange" : "teal"}`}
                            onClick={toggleFaceTracking}
                        >
                            {isFaceTracking ? "👁️ ⏹️ ปิดสบตา" : "📷 สบตา (Face Tracking)"}
                        </button>
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


                <div
                    className="webcam-dedicated-card"
                    style={{ display: isFaceTracking ? "flex" : "none" }}
                >
                    <div className="webcam-info-side">
                        <div className="webcam-status-header">
                            <span className="status-live-dot">●</span>
                            <span className="webcam-status-title">ระบบสบตาผู้ใช้ (Eye Contact Face Tracking)</span>
                        </div>
                        <p className="webcam-status-desc">{trackerStatus || "กำลังตรวจจับใบหน้า..."}</p>
                        <button className="webcam-close-btn" onClick={toggleFaceTracking}>
                            ⏹️ ปิดระบบสบตา
                        </button>
                    </div>
                </div>


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
