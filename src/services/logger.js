/**
 * Standard Plain-Text Console Logger for Browser F12 Developer Console
 */

export function addLog(category, message, details = null) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    let logLine = `[${category}] ${time} - ${message}`;
    if (details !== null && details !== undefined) {
        logLine += ` | ${details}`;
    }
    console.log(logLine);
}
