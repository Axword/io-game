export class RoomMenuScreen {
    constructor(onLeaveRoom) {
        this.onLeaveRoom = onLeaveRoom;
        this.room = null;
    }
    
    show(room) {
        this.room = room;
        this.updateContent();
    }
    
    hide() {
    }
    
    toggle(room) {
        if (!this.room || this.room !== room) {
            this.show(room);
        }
    }
    
    updateContent() {
        if (!this.room) return;
        const duration = this.room.getFormattedDuration();
        const code = this.room.roomId;
        const diff = this.getDifficultyLabel(this.room.difficulty);
        
        console.log(`Pokój: ${code} | Czas: ${duration} | Trudność: ${diff}`);
    }
    
    getDifficultyLabel(difficulty) {
        const labels = {
            easy: '🟢 ŁATWA',
            medium: '🟡 ŚREDNIA',
            hard: '🔴 TRUDNA',
            extreme: '💀 EKSTREMALNA'
        };
        return labels[difficulty] || 'NIEZNANA';
    }
}

