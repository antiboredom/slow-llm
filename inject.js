const originalFetch = window.fetch;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slowSSE(response, delay = 1500) {
  console.log("slow sse");

  let buffer = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new TransformStream({
    async transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/); // sse streams should be split into events by \n\n (but sometimes \r\n??)

      buffer = events.pop();

      for (const event of events) {
        if (event.trim()) {
          controller.enqueue(encoder.encode(event + "\n\n"));
          await sleep(delay);
        }
      }
    },
    async flush(controller) {
      // if there's anything left to do, enqueue it
      if (buffer.trim() !== "") controller.enqueue(encoder.encode(buffer));
    },
  });

  return new Response(response.body.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function slowResponse(response, chunkSize = 200, sleepTime = 16) {
  const stream = new TransformStream({
    async transform(chunk, controller) {
      let offset = 0;
      while (offset < chunk.length) {
        controller.enqueue(chunk.subarray(offset, offset + chunkSize));
        offset += chunkSize;
        if (offset < chunk.length) await sleep(sleepTime);
      }
    },
  });

  return new Response(response.body.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function slowFetch() {
  const response = await originalFetch.apply(this, arguments);
  if (!response.body) return response;

  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("text/event-stream")) {
    return slowSSE(response, 100);
  }

  return response;

  // return slowResponse(response, 100);
}

window.fetch = slowFetch;
