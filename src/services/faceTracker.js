import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { addLog } from "./logger";

let faceLandmarkerInstance = null;
let animFrameId = null;
let webcamStream = null;

/**
 * Get active WebCam stream instance
 */
export function getWebcamStream() {
    return webcamStream;
}

/**
 * Initialize WebCam and Google MediaPipe FaceLandmarker
 * @param {HTMLVideoElement} videoElement Video DOM element to stream WebCam feed
 * @param {function} onFaceUpdate Callback receiving ({ yaw, pitch, detected })
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

        addLog("FACE_TRACKER", "✅ เปิดกล้องสำเร็จ กำลังโหลดโมเดล MediaPipe Face Landmarker...");


        // 3. Load MediaPipe Vision Tasks
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        // Try GPU delegate first, fallback to CPU delegate
        try {
            faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numFaces: 1
            });
        } catch {
            faceLandmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numFaces: 1
            });
        }

        addLog("FACE_TRACKER", "🎥 เริ่มการตรวจจับใบหน้าผู้ใช้ Real-time แล้ว");

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

                    if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                        const landmarks = results.faceLandmarks[0];

                        // Landmark 1: Nose tip
                        // Landmark 33: Left eye outer, Landmark 263: Right eye outer
                        const nose = landmarks[1];
                        const leftEye = landmarks[33];
                        const rightEye = landmarks[263];

                        const eyeCenter = (leftEye.x + rightEye.x) / 2;
                        const yawRaw = (nose.x - eyeCenter) * 6.0;
                        const pitchRaw = (nose.y - 0.5) * 3.5;

                        const yaw = Math.max(-1.0, Math.min(1.0, -yawRaw));
                        const pitch = Math.max(-1.0, Math.min(1.0, pitchRaw));

                        if (onFaceUpdate) {
                            onFaceUpdate({ yaw, pitch, detected: true, nose });
                        }
                    } else {
                        if (onFaceUpdate) {
                            onFaceUpdate({ yaw: 0, pitch: 0, detected: false });
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

    addLog("FACE_TRACKER", "⏹️ ปิดระบบกล้องเรียบร้อย");
}

