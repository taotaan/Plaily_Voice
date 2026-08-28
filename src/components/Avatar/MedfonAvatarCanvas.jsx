import { useEffect, useRef, useState } from "react";
import { TalkingHead } from "@met4citizen/talkinghead";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Ensure WASM MeshoptDecoder is loaded and patch GLTFLoader
MeshoptDecoder.ready.then(() => {
    if (GLTFLoader && !GLTFLoader.prototype._meshoptPatched) {
        GLTFLoader.prototype._meshoptPatched = true;

        const origLoadAsync = GLTFLoader.prototype.loadAsync;
        GLTFLoader.prototype.loadAsync = function (...args) {
            this.setMeshoptDecoder(MeshoptDecoder);
            return origLoadAsync.apply(this, args);
        };

        const origParse = GLTFLoader.prototype.parse;
        GLTFLoader.prototype.parse = function (...args) {
            this.setMeshoptDecoder(MeshoptDecoder);
            return origParse.apply(this, args);
        };
    }
});

function MedfonAvatarCanvas({ onAvatarLoaded, avatarUrl = "/avatars/medfon.glb" }) {
    const containerRef = useRef(null);
    const headRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    useEffect(() => {
        let mounted = true;

        async function initAvatar() {
            if (!containerRef.current) return;

            try {
                setIsLoading(true);
                setLoadError(null);

                await MeshoptDecoder.ready;

                const head = new TalkingHead(
                    containerRef.current,
                    {
                        ttsEndpoint: null,
                        cameraView: "head",
                        avatarMute: true // ปิดเสียงออดิโอของ TalkingHead AudioWorklet ไม่ให้สร้างเสียงวี้ดค้าง
                    }
                );

                // ปิดกั้นไม่ให้ AudioContext ของ TalkingHead ส่งเสียงวี้ด AAAAA ภูมิหลัง
                if (head.audioCtx && typeof head.audioCtx.suspend === "function") {
                    try {
                        head.audioCtx.suspend();
                    } catch (e) {}
                }

                headRef.current = head;
                window.medfonHead = head;

                await head.showAvatar({
                    url: avatarUrl,
                    anim: {
                        "viseme_aa": { "Face": { "jawOpen": 1.0, "Fcl_MTH_A": 1.0 } },
                        "viseme_E":  { "Face": { "jawOpen": 0.4, "mouthSmileLeft": 0.5, "mouthSmileRight": 0.5, "Fcl_MTH_E": 1.0 } },
                        "viseme_I":  { "Face": { "jawOpen": 0.3, "Fcl_MTH_I": 1.0 } },
                        "viseme_O":  { "Face": { "jawOpen": 0.6, "mouthFunnel": 0.8, "Fcl_MTH_O": 1.0 } },
                        "viseme_U":  { "Face": { "jawOpen": 0.3, "mouthPucker": 0.9, "Fcl_MTH_U": 1.0 } }
                    }
                });

                if (mounted) {
                    setIsLoading(false);
                    if (onAvatarLoaded) {
                        onAvatarLoaded(head);
                    }
                }
            } catch (error) {
                console.error("Failed to load 3D Avatar:", error);
                if (mounted) {
                    setIsLoading(false);
                    setLoadError(error.message || "Failed to load 3D model");
                }
            }
        }

        initAvatar();

        return () => {
            mounted = false;
            if (headRef.current && typeof headRef.current.stop === "function") {
                try {
                    headRef.current.stop();
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        };
    }, [avatarUrl]);

    return (
        <div className="avatar-canvas-wrapper">
            <div ref={containerRef} className="avatar-canvas-container" />

            {isLoading && (
                <div className="avatar-loading-overlay">
                    <div className="spinner" />
                    <span>กำลังโหลด 3D Avatar...</span>
                </div>
            )}

            {loadError && (
                <div className="avatar-error-overlay">
                    <span>⚠️ ไม่สามารถโหลด Avatar ได้: {loadError}</span>
                </div>
            )}
        </div>
    );
}

export default MedfonAvatarCanvas;
