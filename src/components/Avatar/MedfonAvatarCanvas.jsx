import { useEffect, useRef, useState } from "react";
import { TalkingHead } from "@met4citizen/talkinghead";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { addLog } from "../../services/logger";
import { LipsyncTh } from "../../modules/lipsync-th";

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
                        cameraView: "head"
                    }
                );

                // Register Thai Lip-Sync Module into TalkingHead
                const lipsyncTh = new LipsyncTh();
                if (!head.lipsync) head.lipsync = {};
                head.lipsync["th"] = lipsyncTh;
                head.lipsync["th-TH"] = lipsyncTh;

                headRef.current = head;
                window.medfonHead = head;

                // Load avatar model
                await head.showAvatar({
                    url: avatarUrl
                });

                // Diagnostic Scan & Dynamic Viseme Mesh Mapping
                const detectedMorphs = [];
                const detectedMeshes = [];
                const faceMeshNames = [];

                if (head.scene) {
                    head.scene.traverse((obj) => {
                        if (obj.isMesh) {
                            detectedMeshes.push(obj.name || "unnamed_mesh");
                            if (obj.morphTargetDictionary) {
                                const keys = Object.keys(obj.morphTargetDictionary);
                                keys.forEach((mKey) => detectedMorphs.push(mKey));

                                const hasFaceMorphs = keys.some((k) => {
                                    const lk = k.toLowerCase();
                                    return lk.includes("mth") || lk.includes("jaw") || lk.includes("mouth") || lk.includes("viseme");
                                });

                                if (hasFaceMorphs || (obj.name && obj.name.toLowerCase().includes("face"))) {
                                    faceMeshNames.push(obj.name);
                                }
                            }
                        }
                    });
                }

                const uniqueMorphs = Array.from(new Set(detectedMorphs));
                console.log("3D Model Meshes Detected:", detectedMeshes);
                console.log("3D Model Morph Targets Detected:", detectedMorphs.length, "Unique:", uniqueMorphs.length);
                console.log("Sample Morph Targets:", uniqueMorphs.slice(0, 50));
                console.log("Mapped Face Meshes for Visemes:", faceMeshNames);

                if (detectedMorphs.length === 0) {
                    console.warn("⚠️ WARNING: No morph targets (BlendShapes) found in this 3D GLB model!");
                    addLog("AVATAR", "⚠️ เตือน: ไม่พบ Morph Targets (BlendShapes) สำหรับขยับใบหน้า/ปากในโมเดล 3D นี้");
                } else {
                    addLog("AVATAR", `พบ ${detectedMeshes.length} Meshes และ ${uniqueMorphs.length} Morph Targets ในโมเดล 3D (${faceMeshNames.length} Face meshes)`);
                }

                if (mounted) {
                    setIsLoading(false);
                    if (onAvatarLoaded) {
                        onAvatarLoaded(head, uniqueMorphs);
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
                } catch {
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
