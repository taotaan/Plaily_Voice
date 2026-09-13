import { useEffect, useRef, useState } from "react";
import { TalkingHead } from "@met4citizen/talkinghead";
import { LipsyncTh } from "../../modules/lipsync-th";
import { addLog } from "../../services/logger";

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

                const head = new TalkingHead(
                    containerRef.current,
                    {
                        ttsEndpoint: null,
                        cameraView: "head",
                        lipsyncModules: []
                    }
                );

                // Register Thai Lipsync Processor directly into TalkingHead Engine (No dynamic fetch 404)
                if (!head.lipsync) head.lipsync = {};
                const thaiLipsync = new LipsyncTh();
                head.lipsync["th"] = thaiLipsync;
                head.lipsync["en"] = thaiLipsync;

                headRef.current = head;
                window.medfonHead = head;

                // Load avatar model with Thai lipsync
                await head.showAvatar({
                    url: avatarUrl,
                    lipsyncLang: "th"
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
