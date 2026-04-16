// ai/combat/CombatStyle.js

/**
 * @abstract
 * Abstrakcyjna klasa bazowa dla stylów walki
 */
export class CombatStyle {
    /**
     * @param {string} name 
     */
    constructor(name) {
        if (new.target === CombatStyle) {
            throw new Error('CombatStyle is abstract');
        }
        
        /** @type {string} */
        this.name = name;
        
        /** @type {number} Idealny dystans walki */
        this.idealDistance = 150;
        
        /** @type {number} Tolerancja dystansu */
        this.distanceTolerance = 50;
    }
    
    /**
     * Wykonuje styl walki
     * @abstract
     * @param {number} dt 
     * @param {BehaviorContext} context 
     * @param {ThreatData} target 
     * @param {number} kiteDirection 
     * @returns {BehaviorResult}
     */
    execute(dt, context, target, kiteDirection) {
        throw new Error('Method execute() must be implemented');
    }
    
    /**
     * Oblicza ruch na podstawie dystansu
     * @protected
     * @param {CombatEntity} bot 
     * @param {ThreatData} target 
     * @param {number} kiteDirection 
     * @returns {{x: number, y: number}}
     */
    calculateMovement(bot, target, kiteDirection) {
        const dist = target.distance;
        const dir = bot.directionTo(target.entity);
        
        if (dist > this.idealDistance + this.distanceTolerance) {
            // Za daleko - podejdź
            return { x: dir.x, y: dir.y };
        } else if (dist < this.idealDistance - this.distanceTolerance) {
            // Za blisko - cofnij się
            return { x: -dir.x, y: -dir.y };
        } else {
            // Optymalny dystans - krąż
            const angle = Math.atan2(dir.y, dir.x);
            const perpAngle = angle + (Math.PI / 2) * kiteDirection;
            return { 
                x: Math.cos(perpAngle), 
                y: Math.sin(perpAngle) 
            };
        }
    }
    
    /**
     * Unika innych zagrożeń podczas walki
     * @protected
     * @param {CombatEntity} bot 
     * @param {ThreatData[]} otherThreats 
     * @param {number} avoidRange 
     * @returns {{x: number, y: number}}
     */
    avoidOtherThreats(bot, otherThreats, avoidRange = 150) {
        let avoidX = 0, avoidY = 0;
        
        for (const threat of otherThreats.slice(0, 3)) {
            if (threat.distance < avoidRange) {
                const dir = bot.directionTo(threat.entity);
                const weight = (avoidRange - threat.distance) / avoidRange;
                avoidX -= dir.x * weight * 0.5;
                avoidY -= dir.y * weight * 0.5;
            }
        }
        
        return { x: avoidX, y: avoidY };
    }
}