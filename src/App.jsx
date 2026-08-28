import MedfonAvatar from "./MedfonAvatar";

function App() {
    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-brand">
                    <div className="brand-logo">🌸</div>
                    <div className="brand-text">
                        <h1>ปลายลี่ (Plailie) AI</h1>
                        <span className="brand-tagline">ผู้ช่วยเสมือนภาษาไทย 3D Interactive Avatar</span>
                    </div>
                </div>
            </header>

            <main className="app-main-content">
                <MedfonAvatar />
            </main>
        </div>
    );
}

export default App;