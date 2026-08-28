
import { useEffect, useRef, useState } from "react";
import { TalkingHead } from "@met4citizen/talkinghead";

function MedfonAvatar() {
    const containerRef = useRef(null);
    const headRef = useRef(null);
    const [visemes, setVisemes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function loadAvatar() {
            if (!containerRef.current) return;

            try {
                const head = new TalkingHead(
                    containerRef.current,
                    {
                        ttsEndpoint: null
                    }
                );

                headRef.current = head;
                window.medfonHead = head;

                await head.showAvatar({
                    url: "/avatars/medfon.glb"
                });

                if (mounted) {
                    console.log("Medfon Avatar loaded");
                    console.log("TalkingHead:", head);
                    if (head.visemeNames) {
                        setVisemes(head.visemeNames);
                    }
                    setIsLoading(false);
                }
            } catch (error) {
                console.error(
                    "Failed to load Medfon Avatar:",
                    error
                );
                if (mounted) {
                    setIsLoading(false);
                }
            }
        }

        loadAvatar();

        return () => {
            mounted = false;
        };
    }, []);

    const testViseme = (viseme) => {
        const head = headRef.current;

        if (!head) {
            console.warn("Avatar is not loaded yet");
            return;
        }

        console.log("Testing viseme:", viseme);

        try {
            head.speakMarker({
                type: "viseme",
                value: viseme
            });
        } catch (error) {
            console.error("Viseme test failed:", error);
        }
    };

    return (
        <div style={{ width: "100%", maxWidth: "800px", margin: "0 auto" }}>
            {/* Container สำหรับแสดง 3D Avatar Canvas */}
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: "500px",
                    backgroundColor: "#1e1e1e",
                    borderRadius: "12px",
                    position: "relative",
                    overflow: "hidden"
                }}
            />

            {isLoading && (
                <div style={{ marginTop: "12px", color: "#888" }}>
                    กำลังโหลด Avatar...
                </div>
            )}

            {/* ปุ่มทดสอบ Viseme */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    marginTop: "20px"
                }}
            >
                {visemes.map((viseme) => (
                    <button
                        key={viseme}
                        onClick={() => testViseme(viseme)}
                        style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            cursor: "pointer"
                        }}
                    >
                        {viseme}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default MedfonAvatar;

