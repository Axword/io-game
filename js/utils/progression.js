const KEY = 'arenaio_world_progress_v1';
export function loadWorldProgress() {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) || '{}');
        return Math.max(1, Math.min(200, Math.floor(Number(value.maxLevelReached) || 1)));
    } catch { return 1; }
}
export function saveWorldProgress(level) {
    const maximum = Math.max(loadWorldProgress(), Math.min(200, Math.floor(level || 1)));
    try { localStorage.setItem(KEY, JSON.stringify({ maxLevelReached: maximum })); } catch {}
    return maximum;
}
