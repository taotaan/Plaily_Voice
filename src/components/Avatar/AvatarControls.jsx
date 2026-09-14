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
    videoRef,
    isCameraOpen,
    setIsCameraOpen,
    isFaceTracking,
    setIsFaceTracking,
    trackerStatus,
    setTrackerStatus
}) {
    const toggleCameraAndTracking = async () => {
        const isActive = isCameraOpen || isFaceTracking;

        if (isActive) {
            stopFaceTracker();
            if (setIsCameraOpen) setIsCameraOpen(false);
            if (setIsFaceTracking) setIsFaceTracking(false);
            if (setTrackerStatus) setTrackerStatus("");
            const activeHead = getActiveHead(head);
            if (activeHead && typeof activeHead.setValue === "function") {
                activeHead.setValue("headRotateY", 0);
                activeHead.setValue("headRotateX", 0);
            }
        } else {
            try {
                if (setTrackerStatus) setTrackerStatus("กำลังเปิดกล้องและระบบสบตา...");
                const targetVid = videoRef ? videoRef.current : null;

                await startFaceTracker(targetVid, ({ yaw, pitch, detected }) => {
                    const activeHead = getActiveHead(head);
                    if (activeHead) {
                        if (detected) {
                            if (typeof activeHead.setValue === "function") {
                                activeHead.setValue("headRotateY", yaw * 0.4);
                                activeHead.setValue("headRotateX", pitch * 0.3);
                            }
                            if (setTrackerStatus) setTrackerStatus("เปิดกล้องคุยสดและกำลังสบตากับคุณ");
                        } else {
                            if (typeof activeHead.setValue === "function") {
                                activeHead.setValue("headRotateY", 0);
                                activeHead.setValue("headRotateX", 0);
                            }
                            if (setTrackerStatus) setTrackerStatus("กำลังตรวจจับใบหน้า...");
                        }
                    }
                });

                if (setIsCameraOpen) setIsCameraOpen(true);
                if (setIsFaceTracking) setIsFaceTracking(true);
            } catch (err) {
                console.error("Camera & Face tracker error:", err);
                if (setTrackerStatus) setTrackerStatus(`ไม่สามารถเปิดกล้องได้: ${err.message || ""}`);
                if (setIsCameraOpen) setIsCameraOpen(false);
                if (setIsFaceTracking) setIsFaceTracking(false);
            }
        }
    };

    useEffect(() => {
        return () => {
            stopFaceTracker();
        };
    }, []);

    const isLive = isCameraOpen || isFaceTracking;

    return (
        <div className="avatar-controls-toolbar">
            <div className="btn-group main-controls">
                <button
                    className={`ctrl-btn ${isLive ? "pink" : "green"}`}
                    onClick={toggleCameraAndTracking}
                >
                    {isLive ? "ปิดกล้องคุยสด" : "เปิดกล้องคุยสดและสบตา"}
                </button>
                <button className="ctrl-btn green" onClick={() => playAvatarGesture(head, "wave")}>
                    ทักทาย (โบกมือ)
                </button>
                <button className="ctrl-btn orange" onClick={() => playAvatarGesture(head, "think")}>
                    แสดงความคิด
                </button>
                <button className="ctrl-btn pink" onClick={() => playAvatarGesture(head, "welcome")}>
                    แสดงความเคารพ
                </button>
            </div>

            {isLive && (
                <div className="webcam-status-bar">
                    <span className="status-live-dot">●</span>
                    <span>{trackerStatus || "เปิดกล้องคุยสดและสบตาอยู่"}</span>
                </div>
            )}
        </div>
    );
}

export default AvatarControls;



