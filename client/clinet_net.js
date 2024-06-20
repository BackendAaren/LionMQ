import http from "http";

class MessageQueueClient {
  constructor(hostname, port) {
    this.options = {
      hostname: hostname,
      port: port,
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  // Enqueue a message to a specific channel
  enqueueMessage(channel, message) {
    const options = {
      ...this.options,
      path: `/enqueue/${channel}`,
      method: "POST",
    };

    const req = http.request(options, (res) => {
      console.log(`Status Code: ${res.statusCode}`);
      res.setEncoding("utf8");
      res.on("data", (data) => {
        console.log(`Response: ${data}`);
      });
    });

    req.on("error", (error) => {
      console.error(`Error: ${error.message}`);
    });

    req.write(JSON.stringify(message));
    req.end();
  }

  // Dequeue a message from a specific channel using async/await
  async dequeueMessage(channel) {
    const options = {
      ...this.options,
      path: `/dequeue/${channel}`,
      method: "GET",
    };

    try {
      const data = await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let rawData = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            rawData += chunk;
          });

          res.on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(rawData);
            } else {
              reject(
                new Error(`Request failed with status code ${res.statusCode}`)
              );
            }
          });
        });

        req.on("error", (error) => {
          reject(error);
        });

        req.end();
      });

      console.log(`Message consume: ${data}`);
      return data;
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }
}

// 使用示例
const client = new MessageQueueClient("localhost", 3001);

// // Enqueue sample messages
// for (let i = 0; i < 20; i++) {
//   client.enqueueMessage("channel1", {
//     messageType: "text",
//     payload: `Message${i}`,
//   });
// }
// for (let i = 0; i < 5; i++) {
//   client.enqueueMessage("channel2", {
//     messageType: "text",
//     payload: `Message${i + 10}`,
//   });
// }

// setInterval(() => {
//   client.enqueueMessage("Aaren", {
//     messageType: "text",
//     payload: `Message:${Math.random() + 10}`,
//   });
// }, 100);
// setInterval(() => {
//   client.enqueueMessage("channel1", {
//     messageType: "text",
//     payload: `Message:${Math.random() + 10}`,
//   });
// }, 200);

// setInterval(() => {
//   client.enqueueMessage("channel2", {
//     messageType: "text",
//     payload: `Message:${Math.random() + 10}`,
//   });
// }, 300);
setInterval(() => {
  client.dequeueMessage("channel1");
}, 100);
setInterval(() => {
  client.dequeueMessage("channel2");
}, 100);
setInterval(() => {
  client.dequeueMessage("Aaren");
}, 1000);

// setInterval(() => {
//   client.dequeueMessage("channel1");
// }, 10);
// client.dequeueMessage("channel2");
