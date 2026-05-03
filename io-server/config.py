WORLD = 12000

SPAWN_POINTS = [
    {"x": 0, "y": 0},
    {"x": 500, "y": 500},
    {"x": -500, "y": 500},
    {"x": 500, "y": -500},
    {"x": -500, "y": -500},
]

ZONES = [
    {"minR": 0, "maxR": 1500, "col": 0x88ff88},
    {"minR": 1500, "maxR": 3000, "col": 0xffff88},
    {"minR": 3000, "maxR": 4500, "col": 0xffaa88},
    {"minR": 4500, "maxR": 5500, "col": 0xff8888},
    {"minR": 5500, "maxR": 6000, "col": 0xff4444},
]

CLASSES = {
    "warrior":    {"hp": 145, "spd": 1.00, "weapon": "aura",      "shape": "sq",  "col": 0x4488ff},
    "archer":     {"hp": 92,  "spd": 1.16, "weapon": "bow",       "shape": "tri", "col": 0x44ff88},
    "mage":       {"hp": 102, "spd": 1.03, "weapon": "lightning",  "shape": "cir", "col": 0xcc44ff},
    "berserker":  {"hp": 125, "spd": 1.12, "weapon": "axe",       "shape": "dia", "col": 0xff6644},
    "pyromancer": {"hp": 96,  "spd": 1.02, "weapon": "fireball",  "shape": "cir", "col": 0xff3300},
    "assassin":   {"hp": 84,  "spd": 1.20, "weapon": "knife",     "shape": "tri", "col": 0xaaaaaa},
    "necromancer":{"hp": 110, "spd": 0.98, "weapon": "poison",    "shape": "dia", "col": 0x00cc44},
    "paladin":    {"hp": 138, "spd": 0.96, "weapon": "sword",     "shape": "sq",  "col": 0x88ccff},
    "warlock":    {"hp": 90,  "spd": 1.04, "weapon": "laser",     "shape": "cir", "col": 0xff00ff},
    "druid":      {"hp": 118, "spd": 1.01, "weapon": "meteor",    "shape": "dia", "col": 0xff8800},
}

WEAPONS = {
    "aura":      {"cooldown": 0.38, "stats": {"dmg": 8, "range": 95}},
    "bow":       {"cooldown": 0.8,  "stats": {"dmg": 35, "bSpd": 25, "bCnt": 1, "bSz": 1, "pierce": 0}},
    "lightning": {"cooldown": 1.1,  "stats": {"dmg": 22, "targets": 1, "chain": 3}},
    "axe":       {"cooldown": 1.9,  "stats": {"dmg": 30, "bSz": 1, "bSpd": 7, "pierce": 999}},
    "fireball":  {"cooldown": 2.8,  "stats": {"dmg": 55, "bSpd": 12, "bCnt": 1, "bSz": 1.5, "explosion": 120}},
    "knife":     {"cooldown": 0.18, "stats": {"dmg": 8, "bSpd": 40, "bCnt": 1, "bSz": 0.6, "pierce": 0, "bBnc": 2}},
    "laser":     {"cooldown": 2.5,  "stats": {"dmg": 50, "duration": 1.0, "range": 350, "width": 18}},
    "poison":    {"cooldown": 3.0,  "stats": {"dmg": 20, "duration": 5, "range": 150, "tick": 0.15}},
    "meteor":    {"cooldown": 4.0,  "stats": {"dmg": 100, "bCnt": 1, "impact": 200, "bSz": 1.5}},
    "sword":     {"cooldown": 0.1,  "stats": {"dmg": 12, "orbit": 120, "count": 1, "speed": 3, "maxCount": 4}},
}