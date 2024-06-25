import http from "http";
import { WebSocketServer } from "ws";
import osUtils from "node-os-utils";
import path from "path";
import { fileURLToPath } from "url"; // 引入 fileURLToPath
import { dirname } from "path"; // 引入 dirname
import axios from "axios";
import express from "express";
import bodyParser from "body-parser";
// Import MessageQueue and MessageType classes
import { MessageQueue, MessageType } from "./controller/messageQueue.js";
import { NodeManager } from "./controller/nodeManager.js";
// 取得目前模組的檔案路徑
const __filename = fileURLToPath(import.meta.url);

// Start server
const PORT = 3004;
// 從檔案路徑中取得目錄路徑
const __dirname = dirname(__filename);
const app = express();
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
// Middleware
app.use(bodyParser.json());
// Initialize MessageQueue instance
//initialize nodeManager
const nodes = [
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:3004",
];
const replicationFactor = 2;
let nodeManager = new NodeManager(nodes, replicationFactor);
// wss.on("connection", (ws) => {
//   messageQueue.handleMonitorClient(ws); // 將 WebSocket 連線交給 MessageQueue 類別處理
// });
const messageQueue = new MessageQueue();
const messageQueues = {};
// Route to enqueue a message to a specific channel
app.post("/enqueue/:channel", async (req, res) => {
  try {
    const { channel } = req.params;
    const { messageType, payload } = req.body;

    if (!messageType || !payload) {
      return res
        .status(400)
        .json({ error: "messageType and payload are required" });
    }

    const node = nodeManager.getNodeForKey(channel);
    const message = new MessageType(channel, messageType, payload, node);
    console.log(
      `This work node from now ${channel} and ${node} message is ${message}`
    );
    // 更新工作分配
    nodeManager.workAssignments[channel] = node;
    if (node === `http://localhost:${PORT}`) {
      await messageQueue.enqueue(channel, message);
    } else {
      const targetURL = `${node}/enqueue/${channel}`;
      await axios.post(targetURL, { messageType, payload });
    }
    // if (node !== `http://localhost:${PORT}`) {
    //   const targetNodes = nodeManager.getAvailableNodes(channel);
    //   for (const targetNode of targetNodes) {
    //     nodeManager.replicateMessage(targetNode, channel, message);
    //   }
    // }
    res.status(200).json({ message: "Message enqueue successfully" });
  } catch (error) {
    console.error("Enqueue error:", error);
    res.status(500).json({ error: "Internal server error", details: error });
  }
});

// Route to dequeue a message from a specific channel
app.get("/dequeue/:channel", async (req, res) => {
  const { channel } = req.params;
  const node = nodeManager.getNodeForKey(channel);

  if (!messageQueues[node]) {
    return res.status(404).json({ error: "Channel can not found" });
  }

  messageQueues[node]
    .dequeue(channel)
    .then((message) => res.status(200).json(message))
    .catch((error) => {
      res.status(500).json({ error: "Internal server error", details: error });
    });
  console.log(messageQueues[node].getStats());
});

// Route to acknowledge a message
app.post("/ack/:channel/:messageID", async (req, res) => {
  const { channel, messageID } = req.params;
  const node = nodeManager.getNodeForKey(channel);

  if (!messageQueues[node]) {
    messageQueues[node] = new messageQueue();
  }

  messageQueues[node]
    .ack(channel, messageID)
    .then((success) => {
      if (success) {
        res
          .status(200)
          .json({ message: `${messageID} acknowledged successfully` });
      } else {
        res.status(404).json({ error: `${messageID} not found` });
      }
    })
    .catch((error) =>
      res.status(500).json({ error: `Internal server error`, details: error })
    );
});

app.get(`/health`, (req, res) => {
  res.status(200).send("OK");
});

app.get("/watcher/operationSystemStatus", async (req, res) => {
  const cpuUsage = await osUtils.cpu.usage().then((cpuPercentage) => {
    return cpuPercentage;
  });

  const memUsage = await osUtils.mem.info().then((memInfo) => {
    console.log("Total Memory:", memInfo.totalMemMb, "MB");
    console.log("Free Memory:", memInfo.freeMemMb, "MB");
    console.log("Used Memory:", memInfo.usedMemMb, "MB");
    return memInfo;
  });

  res.status(200).send({ cpuUsage, memUsage });
});

app.get("/watcher.html", (req, res) => {
  res.sendFile(path.join(__dirname, "view", "public", "watcher.html"));
});

// Create HTTP server and attach express app to it
const server = http.createServer(app);

// Create WebSocket server and attach it to the HTTP server
const wss = new WebSocketServer({ server });

// Listen for WebSocket connections
wss.on("connection", (ws) => {
  messageQueue.handleMonitorClient(ws); // 將 WebSocket 連線交給 MessageQueue 類別處理
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
