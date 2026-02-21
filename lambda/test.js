const fs = require("fs");
const path = require("path");
const { handler } = require("./handler");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

function buildEvent({ filePath, contentType }) {
  const body = fs.readFileSync(filePath, "utf8");
  return {
    headers: {
      "content-type": contentType
    },
    body,
    isBase64Encoded: false
  };
}

async function run() {
  const filePath = path.resolve(__dirname, "..", "test", "metrics.jsonl");
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const event = buildEvent({
    filePath,
    contentType: "text/plain"
  });

  try {
    const result = await handler(event);
    console.log("Lambda response:", result);
  } catch (err) {
    console.error("Lambda test failed:", err);
    process.exit(1);
  }
}

run();
