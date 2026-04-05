const STORAGE_KEY = 'arenaio_perm';

export function loadPermStats() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : { luck: 0, speed: 0, hp: 0 };
    } catch (e) {
        console.error('Error loading perm stats:', e);
        return { luck: 0, speed: 0, hp: 0 };
    }
}

export function savePermStats(stats) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error('Error saving perm stats:', e);
    }
}