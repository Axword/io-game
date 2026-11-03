export class RoomMenuScreen {
    constructor(onLeaveRoom) {
        this.onLeaveRoom = onLeaveRoom;
        this.isVisible = false;
        this.screen = document.createElement('div');
        this.screen.id = 's-room-menu';
        this.screen.className = 'screen';
        this.screen.style.display = 'none';
        this.screen.setAttribute('role', 'dialog');
        this.screen.setAttribute('aria-modal', 'true');
        this.screen.setAttribute('aria-label', 'Menu gry');
        this.screen.innerHTML = '<div class="panel-box room-menu-panel"><div class="s-title">MENU</div><div class="room-menu-code"></div><button type="button" class="btn btn-success" id="btn-resume">Wróć do gry</button><button type="button" class="btn" id="btn-menu-leave">Opuść grę</button></div>';
        document.body.appendChild(this.screen);
        this.resumeButton = this.screen.querySelector('#btn-resume');
        this.resumeButton.addEventListener('click', () => this.hide());
        this.screen.querySelector('#btn-menu-leave').addEventListener('click', () => { this.hide(); this.onLeaveRoom?.(); });
    }
    show(room) {
        this.room = room;
        this.isVisible = true;
        const code = this.screen.querySelector('.room-menu-code');
        code.textContent = window.gameInstance?.onlineMode && room?.roomId ? room.roomId : '';
        this.screen.style.display = 'flex';
        this.onVisibilityChange?.(true);
        this.resumeButton.focus?.();
    }
    hide() {
        const wasVisible = this.isVisible;
        this.isVisible = false;
        this.screen.style.display = 'none';
        if (wasVisible) this.onVisibilityChange?.(false);
    }
    toggle(room) { this.isVisible ? this.hide() : this.show(room); }
}
