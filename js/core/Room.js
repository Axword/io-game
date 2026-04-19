export class Room {
    constructor(roomId, difficulty = 'medium') {
        this.roomId = roomId;
        this.difficulty = difficulty;
        this.createdAt = Date.now();
        this.playerStats = new Map();
    }
    
    addPlayer(playerId) {
        if (!this.playerStats.has(playerId)) {
            this.playerStats.set(playerId, {
                permanentStats: { luck: 0, speed: 0, hp: 0 },
                level: 1,
                xp: 0,
                kills: 0,
                totalDmg: 0
            });
        }
    }
    
    getPlayerStats(playerId) {
        if (!this.playerStats.has(playerId)) {
            this.addPlayer(playerId);
        }
        return this.playerStats.get(playerId);
    }
    
    updatePlayerStats(playerId, stats) {
        const current = this.getPlayerStats(playerId);
        Object.assign(current, stats);
    }
    
    getPermanentStats(playerId) {
        return this.getPlayerStats(playerId).permanentStats;
    }
    
    upgradePermanentStat(playerId, statId, amount) {
        const stats = this.getPermanentStats(playerId);
        if (stats.hasOwnProperty(statId)) {
            stats[statId] += amount;
        }
    }
    
    getDuration() {
        return (Date.now() - this.createdAt) / 1000;
    }
    
    getFormattedDuration() {
        const seconds = Math.floor(this.getDuration());
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        }
        return `${minutes}m ${secs}s`;
    }
}
