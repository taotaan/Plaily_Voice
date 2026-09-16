import { FilesetResolver, FaceLandmarker, GestureRecognizer } from "@mediapipe/tasks-vision";
import { addLog } from "./logger";

let faceLandmarkerInstance = null;
let gestureRecognizerInstance = null;
let animFrameId = null;
let webcamStream = null;

/**
 * Get active WebCam stream instance
 */
export function getWebcamStream() {
    return webcamStream;
}

/**
 * Initialize WebCam, MediaPipe FaceLandmarker, and GestureRecognizer
 * @param {HTMLVideoElement} videoElement Video DOM element to stream WebCam feed
 * @param {function} onFaceUpdate Callback receiving ({ yaw, pitch, detected, isSmiling, smileRatio, isWaving, gestureCategory })
 */
export async function startFaceTracker(videoElement, onFaceUpdate) {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    if (faceLandmarkerInstance) {
        try { faceLandmarkerInstance.close(); } catch { }
        faceLandmarkerInstance = null;
    }
    if (gestureRecognizerInstance) {
        try { gestureRecognizerInstance.close(); } catch { }
        gestureRecognizerInstance = null;
    }

    try {
        if (!webcamStream) {
            await openWebcamStream(videoElement);
        }

        // Target Video Element
        let targetVideo = videoElement;
        if (!targetVideo) {
            targetVideo = document.createElement("video");
            targetVideo.autoplay = true;
            targetVideo.playsInline = true;
            targetVideo.muted = true;
        }

        if (webcamStream && targetVideo) {
            if (targetVideo.srcObject !== webcamStream) {
                targetVideo.srcObject = webcamStream;
            }
            if (targetVideo.readyState >= 1) {
                try { await targetVideo.play(); } catch (e) { }
            } else {
                await new Promise((resolve) => {
                    targetVideo.onloadedmetadata = () => {
                        targetVideo.play().then(resolve).catch(resolve);
                    };
                    setTimeout(resolve, 800);
                });
            }
        }

        addLog("FACE_TRACKER", "✅ เปิดกล้องสำเร็จ กำลังโหลดโมเดล MediaPipe Face & Gesture...");


        // 3. Load MediaPipe Vision Tasks
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        // Try GPU delegate first, fallback to CPU delegate for FaceLandmarker
        try {
            faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "GPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
        } catch {
            faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "CPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
        }

        // Load GestureRecognizer for Waving & Hand Gestures
        try {
            gestureRecognizerInstance = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            });
        } catch {
            try {
                gestureRecognizerInstance = await GestureRecognizer.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
                        delegate: "CPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 2
                });
            } catch (err) {
                console.warn("GestureRecognizer init warning:", err);
            }
        }

        addLog("FACE_TRACKER", "🎥 เริ่มการตรวจจับใบหน้า, สีหน้า 52 Blendshapes และการโบกมือ Real-time แล้ว");

        let lastVideoTime = -1;

        const processFrame = () => {
            if (!faceLandmarkerInstance || !targetVideo || targetVideo.paused || targetVideo.ended) {
                animFrameId = requestAnimationFrame(processFrame);
                return;
            }

            const startTimeMs = performance.now();
            if (targetVideo.currentTime !== lastVideoTime) {
                lastVideoTime = targetVideo.currentTime;

                try {
                    const results = faceLandmarkerInstance.detectForVideo(targetVideo, startTimeMs);
                    let isWaving = false;
                    let gestureCategory = "";

                    // Run Hand Gesture recognition if active
                    if (gestureRecognizerInstance) {
                        try {
                            const gestureRes = gestureRecognizerInstance.recognizeForVideo(targetVideo, startTimeMs);
                            if (gestureRes && gestureRes.gestures && gestureRes.gestures.length > 0) {
                                const topGesture = gestureRes.gestures[0][0];
                                if (topGesture) {
                                    gestureCategory = topGesture.categoryName;
                                    if (topGesture.score > 0.45 && (gestureCategory === "Open_Palm" || gestureCategory === "Thumb_Up" || gestureCategory === "Victory")) {
                                        isWaving = true;
                                    }
                                }
                            }
                        } catch (e) { }
                    }

                    if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                        const landmarks = results.faceLandmarks[0];

                        const nose = landmarks[1];
                        const leftEye = landmarks[33];
                        const rightEye = landmarks[263];

                        const eyeCenter = (leftEye.x + rightEye.x) / 2;
                        const eyeCenterY = (leftEye.y + rightEye.y) / 2;
                        const eyeWidth = Math.max(0.01, Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y));

                        // Normalized Head Rotation (Position independent)
                        const noseHorizDiff = (nose.x - eyeCenter) / eyeWidth;
                        const noseVertDiff = (nose.y - eyeCenterY) / eyeWidth;

                        const yawRaw = noseHorizDiff * 3.2;
                        const pitchRaw = (noseVertDiff - 0.40) * 3.5;

                        const yaw = Math.max(-1.0, Math.min(1.0, -yawRaw));
                        const pitch = Math.max(-1.0, Math.min(1.0, pitchRaw));

                        // Extract MediaPipe 52 ARKit Blendshapes
                        const shapes = {};
                        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                            for (const b of results.faceBlendshapes[0].categories) {
                                shapes[b.categoryName] = b.score;
                            }
                        }

                        const smileScore = ((shapes["mouthSmileLeft"] || 0) + (shapes["mouthSmileRight"] || 0)) / 2;
                        const surpriseScore = ((shapes["browOuterUpLeft"] || 0) + (shapes["browOuterUpRight"] || 0) + (shapes["jawOpen"] || 0)) / 3;
                        const angryScore = ((shapes["browDownLeft"] || 0) + (shapes["browDownRight"] || 0)) / 2;
                        const sadScore = ((shapes["mouthFrownLeft"] || 0) + (shapes["mouthFrownRight"] || 0) + (shapes["browInnerUp"] || 0)) / 3;
                        const blinkLeft = shapes["eyeBlinkLeft"] || 0;
                        const blinkRight = shapes["eyeBlinkRight"] || 0;

                        // Determine dynamic real-time facial expression mood
                        let currentMood = "neutral";
                        if (smileScore > 0.28) {
                            currentMood = "happy";
                        } else if (surpriseScore > 0.32) {
                            currentMood = "surprised";
                        } else if (angryScore > 0.35) {
                            currentMood = "angry";
                        } else if (sadScore > 0.30) {
                            currentMood = "sad";
                        }

                        if (onFaceUpdate) {
                            onFaceUpdate({
                                yaw,
                                pitch,
                                detected: true,
                                nose,
                                currentMood,
                                smileScore,
                                surpriseScore,
                                angryScore,
                                sadScore,
                                blinkLeft,
                                blinkRight,
                                isWaving,
                                gestureCategory
                            });
                        }
                    } else {
                        if (onFaceUpdate) {
                            onFaceUpdate({
                                yaw: 0,
                                pitch: 0,
                                detected: false,
                                currentMood: "neutral",
                                smileScore: 0,
                                surpriseScore: 0,
                                angryScore: 0,
                                sadScore: 0,
                                blinkLeft: 0,
                                blinkRight: 0,
                                isWaving: false,
                                gestureCategory: ""
                            });
                        }
                    }
                } catch (e) {
                    // Ignore transient detection frame errors
                }
            }

            animFrameId = requestAnimationFrame(processFrame);
        };

        animFrameId = requestAnimationFrame(processFrame);
        return true;
    } catch (error) {
        addLog("FACE_TRACKER", "⚠️ ไม่สามารถเปิดระบบตรวจจับใบหน้าได้", error.message);
        stopFaceTracker();
        throw error;
    }
}

/**
 * Open WebCam stream only (Video Preview without Face Tracking)
 * @param {HTMLVideoElement} videoElement
 */
export async function openWebcamStream(videoElement) {
    if (webcamStream) {
        if (videoElement && videoElement.srcObject !== webcamStream) {
            videoElement.srcObject = webcamStream;
            try { await videoElement.play(); } catch (e) { }
        }
        return webcamStream;
    }

    try {
        addLog("FACE_TRACKER", "📷 ขอสิทธิ์เปิดกล้อง WebCam...");
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false
        });

        if (videoElement) {
            videoElement.srcObject = webcamStream;
            try { await videoElement.play(); } catch (e) { }
        }
        addLog("FACE_TRACKER", "✅ เปิดกล้อง WebCam แสดงผลสำเร็จ");
        return webcamStream;
    } catch (err) {
        addLog("FACE_TRACKER", `⚠️ ไม่สามารถเปิดกล้องได้: ${err.message}`);
        throw err;
    }
}

/**
 * Stop WebCam stream and release MediaPipe FaceLandmarker resources
 */
export function stopFaceTracker() {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    if (webcamStream) {
        try {
            webcamStream.getTracks().forEach((track) => track.stop());
        } catch {
            // Ignore stream cleanup errors
        }
        webcamStream = null;
    }

    if (faceLandmarkerInstance) {
        try {
            faceLandmarkerInstance.close();
        } catch {
            // Ignore close errors
        }
        faceLandmarkerInstance = null;
    }

    if (gestureRecognizerInstance) {
        try {
            gestureRecognizerInstance.close();
        } catch {
            // Ignore close errors
        }
        gestureRecognizerInstance = null;
    }

    addLog("FACE_TRACKER", "⏹️ ปิดระบบกล้องเรียบร้อย");
}

