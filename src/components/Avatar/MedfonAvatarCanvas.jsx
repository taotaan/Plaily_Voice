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

                // Ensure container is clean and previous instance is stopped before creating new engine instance
                if (headRef.current && typeof headRef.current.stop === "function") {
                    try { headRef.current.stop(); } catch (e) { }
                }
                if (containerRef.current) {
                    containerRef.current.innerHTML = "";
                }

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

                if (!mounted) {
                    if (typeof head.stop === "function") {
                        try { head.stop(); } catch (e) { }
                    }
                    return;
                }

                // Synthesize & register viseme_* morph targets for TalkingHead Lip-sync engine (gentle soft mouth weights)
                if (head.morphs && typeof head.addMixedMorphTarget === "function") {
                    const visemeMap = {
                        viseme_aa: { Fcl_MTH_A: 0.5, jawOpen: 0.15 },
                        viseme_E: { Fcl_MTH_E: 0.45 },
                        viseme_I: { Fcl_MTH_I: 0.4 },
                        viseme_O: { Fcl_MTH_O: 0.45, mouthFunnel: 0.2 },
                        viseme_U: { Fcl_MTH_U: 0.4, mouthPucker: 0.2 },
                        viseme_PP: { Fcl_MTH_Close: 0.5 },
                        viseme_FF: { Fcl_MTH_Close: 0.4, Fcl_MTH_Small: 0.2 },
                        viseme_TH: { Fcl_MTH_A: 0.3, jawOpen: 0.1 },
                        viseme_DD: { Fcl_MTH_A: 0.3, Fcl_MTH_I: 0.2 },
                        viseme_kk: { Fcl_MTH_A: 0.35 },
                        viseme_nn: { Fcl_MTH_I: 0.25 },
                        viseme_RR: { Fcl_MTH_O: 0.35 },
                        viseme_CH: { Fcl_MTH_E: 0.35 },
                        viseme_SS: { Fcl_MTH_I: 0.4 },
                        viseme_sil: { Fcl_MTH_Neutral: 1.0 }
                    };

                    for (const [vName, sources] of Object.entries(visemeMap)) {
                        head.addMixedMorphTarget(head.morphs, vName, sources, true);
                        if (head.mtAvatar && !head.mtAvatar[vName]) {
                            head.mtAvatar[vName] = {
                                fixed: null, realtime: null, system: null, systemd: null, newvalue: null, ref: null,
                                min: 0, max: 1, easing: head.mtEasingDefault, base: null, v: 0, needsUpdate: true,
                                acc: (head.mtAccDefault || 0.01) / 1000, maxv: head.mtMaxVDefault || 5
                            };
                        }
                    }
                }

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
            headRef.current = null;
            if (containerRef.current) {
                containerRef.current.innerHTML = "";
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
