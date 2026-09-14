import MedfonAvatar from "./MedfonAvatar";

function App() {
    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-brand">
                    <div className="brand-logo">PL</div>
                    <div className="brand-text">
                        <h1>Plailie Virtual Assistant</h1>
                        <span className="brand-tagline">ระบบผู้ช่วยเสมือนตอบสนองด้วยเสียงและโมเดล 3 มิติ (ปลายลี่)</span>
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