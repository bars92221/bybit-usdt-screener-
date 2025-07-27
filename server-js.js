import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import { CryptoScreener } from './src/screener.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket setup
const wss = new WebSocketServer({ server });

// Initialize screener
const screener = new CryptoScreener();

// Store WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected');
  
  // Send current signals on connection
  screener.getSignals().then(signals => {
    ws.send(JSON.stringify({ type: 'signals', data: signals }));
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'refresh') {
        screener.getSignals().then(signals => {
          ws.send(JSON.stringify({ type: 'signals', data: signals }));
        });
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
});

// Broadcast signals to all connected clients
function broadcastSignals(signals) {
  const message = JSON.stringify({ type: 'signals', data: signals });
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// API Routes
app.get('/api/signals', async (req, res) => {
  try {
    const signals = await screener.getSignals();
    res.json(signals);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    await screener.scanMarket();
    const signals = await screener.getSignals();
    broadcastSignals(signals);
    res.json({ success: true, signals });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh signals' });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start screener with periodic scanning
screener.start((signals) => {
  broadcastSignals(signals);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});