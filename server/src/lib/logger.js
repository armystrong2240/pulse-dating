import { LOG_LEVEL, NODE_ENV } from "../config/env.js";

const levelRank = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level) {
  return (levelRank[level] || 20) >= (levelRank[LOG_LEVEL] || 20);
}

function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function write(level, event, fields = {}) {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    env: NODE_ENV,
    event,
    ...fields,
  };

  const text = JSON.stringify(payload);
  if (level === "error") {
    console.error(text);
  } else if (level === "warn") {
    console.warn(text);
  } else {
    console.log(text);
  }
}

export const logger = {
  debug(event, fields) {
    write("debug", event, fields);
  },
  info(event, fields) {
    write("info", event, fields);
  },
  warn(event, fields) {
    write("warn", event, fields);
  },
  error(event, fields) {
    write("error", event, fields);
  },
  serializeError,
};
