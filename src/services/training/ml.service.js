/**
 * ML Service: Communicates with the Python ML prediction API.
 */

const http = require('http');

const ML_CONFIG = {
  hostname: 'localhost',
  port: 5001,
  path: '/predict',
  method: 'POST',
  timeout: 3000
};

const getMLPrediction = async (features) => {
  return new Promise((resolve) => {
    const body = JSON.stringify(features);
    
    const options = {
      ...ML_CONFIG,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          // New predict service returns { status: "success", prediction: "overtraining" }
          resolve(response.prediction || "unknown");
        } catch (e) {
          console.error("[ML Service Error]: Failed to parse prediction response", e.message);
          resolve("unknown");
        }
      });
    });

    req.on("error", (error) => {
      console.error("[ML Service Error]: Connection failed:", error.message);
      resolve("unknown");
    });

    req.on("timeout", () => {
      console.warn("[ML Service Warning]: API request timed out, falling back to unknown");
      req.destroy();
      resolve("unknown");
    });

    req.write(body);
    req.end();
  });
};

module.exports = {
  getMLPrediction
};
