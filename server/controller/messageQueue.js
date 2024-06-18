import { v4 as uuidv4 } from "uuid";
import os from "os";
import { timeStamp } from "console";
export class MessageType {
  constructor(channel, messageType, payload) {
    this.channel = channel;
    this.messageType = messageType;
    this.payload = payload;
    this.messageID = null;
  }
}

export class MessageQueue {
  constructor() {
    this.channels = {};
    this.waiting = {};
    this.monitorClients = new Set();

    this.stats = {
      length: {},
      throughput: {},
      delay: {},
      blocked: {},
      messageTotalComplete: {},
      now_executing: {},
      inboundRate: {},
      outboundRate: {},
    };
    // 定義計算進入和出站速率的計時器
    setInterval(() => {
      this.calculateInboundRates();
      this.calculateOutboundRates();
    }, 1000); // 每秒執行一次計算
  }

  calculateInboundRates() {
    const now = Date.now();
    Object.keys(this.stats.inboundRate).forEach((channel) => {
      const { count, timestamp } = this.stats.inboundRate[channel];
      const elapsedTime = (now - timestamp) / 1000;
      const inboundRate = elapsedTime > 0 ? count / elapsedTime : 0;
      console.log(
        `Channel ${channel} inbound rate: ${inboundRate.toFixed(2)} MPS`
      );
      this.stats.inboundRate[channel] = {
        count: 0,
        timestamp: now,
        inboundRate: `${inboundRate.toFixed(2)}MPS`,
      };
    });
  }

  calculateOutboundRates() {
    const now = Date.now();
    Object.keys(this.stats.outboundRate).forEach((channel) => {
      const { count, timestamp } = this.stats.outboundRate[channel];
      const elapsedTime = (now - timestamp) / 1000;
      const outboundRate = elapsedTime > 0 ? count / elapsedTime : 0;
      console.log(
        `Channel ${channel} outbound rate: ${outboundRate.toFixed(2)} MPS`
      );
      this.stats.outboundRate[channel] = {
        count: 0,
        timestamp: now,
        outboundRate: `${outboundRate.toFixed(2)}MPS`,
      };
    });
  }

  updateMonitorStatus(statusUpdates) {
    Object.assign(this.stats, statusUpdates);
    this.broadcastMonitorStatus();
  }
  //傳監控資訊給所有連線監控端
  broadcastMonitorStatus() {
    const statusMessage = JSON.stringify(this.stats);
    this.stats.forEach((client) => {
      client.send(statusMessage);
    });
  }
  //處理websocket連線
  handleMonitorClient(client) {
    this.stats.add(client);

    client.send(JSON.stringify(this.stats));

    client.on("close", () => {
      this.stats.delete(client);
    });
  }

  async enqueue(channel, message) {
    const enqueueTime = Date.now();
    message.messageID = uuidv4().slice(0, 7);
    if (!this.channels[channel]) {
      this.channels[channel] = [];
    }
    this.channels[channel].push(message);
    message.enqueueTime = enqueueTime;
    //監控佇列長度
    this.stats.length[channel] = this.channels[channel].length;
    //計算吞吐量
    if (!this.stats.throughput[channel]) {
      this.stats.throughput[channel] = { in: 0, out: 0 };
    }
    this.stats.throughput[channel].in += 1;
    // 計算進入消息數量
    if (!this.stats.inboundRate[channel]) {
      this.stats.inboundRate[channel] = {
        count: 0,
        timestamp: Date.now(),
        inboundRate: 0,
      };
    }
    this.stats.inboundRate[channel].count += 1;

    //若dequeue進入等待狀態，enqueue將information推入channel將resolve取出告知dequeue繼續運作
    if (this.waiting[channel] && this.waiting[channel].length > 0) {
      const resolveNext = this.waiting[channel].shift();
      resolveNext();
    }
  }

  async dequeue(channel) {
    if (!this.channels[channel]) {
      this.channels[channel] = [];
    }

    while (this.channels[channel].length === 0) {
      if (!this.waiting[channel]) {
        this.waiting[channel] = [];
      }
      //當channel裡面沒有information時將resolve推入waiting進入等待狀態
      await new Promise((resolve) => this.waiting[channel].push(resolve));
    }
    const message = this.channels[channel].shift();

    //計算throughput
    if (!this.stats.throughput[channel]) {
      this.stats.throughput[channel] = { in: 0, out: 0 };
    }
    this.stats.throughput[channel].out += 1;
    //正在處理的message
    this.stats.now_executing[channel] = message.messageID;
    if (this.channels[channel].length === 0) {
      this.stats.now_executing[channel] = "Message execute complete";
    }
    //計算處理完畢數量
    if (!this.stats.messageTotalComplete[channel]) {
      this.stats.messageTotalComplete[channel] = { totalComplete: 0 };
    }
    this.stats.messageTotalComplete[channel].totalComplete += 1;

    //計算延遲
    const dequeueTime = Date.now();
    this.stats.delay[channel] = dequeueTime - message.enqueueTime;
    //計算outboundRate
    if (!this.stats.outboundRate[channel]) {
      this.stats.outboundRate[channel] = {
        count: 0,
        timesStamp: Date.now(),
        outboundRate: 0,
      };
    }
    this.stats.outboundRate[channel].count += 1;

    return message;
  }

  getStats() {
    return this.stats;
  }
}
