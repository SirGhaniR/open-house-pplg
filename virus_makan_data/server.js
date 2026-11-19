const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const MAX_FOOD = 400;
const MAX_BOOST = 5;
const MAX_MAGNET = 5; // Jumlah item magnet di arena

let players = {};
let foods = [];
let speedBoosts = [];
let magnets = [];

function spawnFood() {
    return {
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        color: `hsl(${Math.random() * 360}, 100%, 60%)`
    };
}

function spawnBoost() {
    return {
        x: Math.random() * (CANVAS_W - 100) + 50,
        y: Math.random() * (CANVAS_H - 100) + 50
    };
}

function spawnMagnet() {
    return {
        x: Math.random() * (CANVAS_W - 100) + 50,
        y: Math.random() * (CANVAS_H - 100) + 50
    };
}

for (let i = 0; i < MAX_FOOD; i++) foods.push(spawnFood());
for (let i = 0; i < MAX_BOOST; i++) speedBoosts.push(spawnBoost());
for (let i = 0; i < MAX_MAGNET; i++) magnets.push(spawnMagnet());

io.on('connection', (socket) => {
    socket.on('joinGame', (nama) => {
        players[socket.id] = {
            id: socket.id,
            nama: nama || 'Bot',
            x: Math.random() * CANVAS_W,
            y: Math.random() * CANVAS_H,
            radius: 20,
            score: 0,
            level: 1, // Level awal pemain
            speedBoostTimer: 0,
            magnetTimer: 0, // Timer durasi magnet
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            targetX: 0,
            targetY: 0,
            isGameOver: false
        };
    });

    socket.on('move', (target) => {
        if (players[socket.id]) {
            players[socket.id].targetX = target.x;
            players[socket.id].targetY = target.y;
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    let activePlayers = Object.values(players).filter(p => !p.isGameOver);

    activePlayers.forEach(p => {
        let dx = p.targetX - p.x;
        let dy = p.targetY - p.y;
        let dist = Math.hypot(dx, dy);

        // Kecepatan dasar melambat seiring ukuran radius, tetapi bertambah +0.5 per Level
        let baseSpeed = Math.max(1, 6 - (p.radius / 30)) + ((p.level - 1) * 0.5);
        
        // Pengali kecepatan jika Speed Boost aktif
        let speedMultiplier = 1;
        if (p.speedBoostTimer > 0) {
            speedMultiplier = 1.8;
            p.speedBoostTimer--;
        }

        let speed = baseSpeed * speedMultiplier;

        if (dist > 5) {
            p.x += (dx / dist) * speed;
            p.y += (dy / dist) * speed;
        }

        p.x = Math.max(p.radius, Math.min(CANVAS_W - p.radius, p.x));
        p.y = Math.max(p.radius, Math.min(CANVAS_H - p.radius, p.y));

        // Efek Magnet Aktif: Menyedot makanan di sekitar
        if (p.magnetTimer > 0) {
            p.magnetTimer--;
            let magnetRadius = p.radius + 50; // Jangkauan magnet 50px
            foods.forEach(f => {
                let fDx = p.x - f.x;
                let fDy = p.y - f.y;
                let fDist = Math.hypot(fDx, fDy);
                if (fDist < magnetRadius && fDist > 5) {
                    f.x += (fDx / fDist) * 12; // Tarik makanan menuju pemain
                    f.y += (fDy / fDist) * 12;
                }
            });
        }

        // Cek Makan Titik Makanan
        for (let i = foods.length - 1; i >= 0; i--) {
            let f = foods[i];
            let distToFood = Math.hypot(p.x - f.x, p.y - f.y);
            if (distToFood < p.radius + 5) {
                p.score += 5;
                p.radius += 0.5;
                foods.splice(i, 1);
                foods.push(spawnFood());
            }
        }

        // System Level Up setiap kelipatan 10.000 Poin
        let targetLevel = Math.floor(p.score / 5000) + 1;
        if (targetLevel > p.level) {
            p.level = targetLevel;
            p.radius = 20; // Ukuran diset ulang menjadi kecil kembali
        }

        // Cek Makan Item Speed Boost ⚡
        for (let i = speedBoosts.length - 1; i >= 0; i--) {
            let sb = speedBoosts[i];
            let distToBoost = Math.hypot(p.x - sb.x, p.y - sb.y);
            if (distToBoost < p.radius + 10) {
                p.speedBoostTimer = 150;
                speedBoosts.splice(i, 1);
                speedBoosts.push(spawnBoost());
            }
        }

        // Cek Makan Item Magnet 🧲
        for (let i = magnets.length - 1; i >= 0; i--) {
            let m = magnets[i];
            let distToMag = Math.hypot(p.x - m.x, p.y - m.y);
            if (distToMag < p.radius + 10) {
                p.magnetTimer = 240; // Magnet aktif selama 8 detik (240 tick)
                magnets.splice(i, 1);
                magnets.push(spawnMagnet());
            }
        }

        // Cek Makan Pemain Lain
        activePlayers.forEach(other => {
            if (p.id !== other.id) {
                let distToOther = Math.hypot(p.x - other.x, p.y - other.y);
                if (distToOther < p.radius && p.radius > other.radius * 1.1) {
                    p.score += Math.floor(other.score / 2);
                    p.radius += other.radius * 0.3;
                    other.isGameOver = true;
                }
            }
        });
    });

    io.emit('gameState', { players, foods, speedBoosts, magnets });
}, 1000 / 30);

server.listen(3000, '0.0.0.0', () => {
    console.log('Server Data Eater berjalan di port 3000');
});
