import { createServer } from 'node:http';

export const SERVER_LIMITS = Object.freeze({
  body_bytes: 128,
  header_bytes: 4096,
  headers_count: 24,
  headers_timeout_ms: 3000,
  keep_alive_timeout_ms: 1000,
  max_connections: 8,
  requests: 20,
  request_timeout_ms: 3000,
});

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>controlled ops local pilot</title></head>
  <body>
    <main>
      <h1>controlled ops local pilot</h1>
      <form id="synthetic-form">
        <label for="safe-input">Safe input</label>
        <input id="safe-input" name="safe-input" autocomplete="off">
        <button type="submit">Submit</button>
      </form>
      <output id="result">idle</output>
    </main>
    <script>
      document.getElementById('synthetic-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const value = document.getElementById('safe-input').value;
        document.getElementById('result').textContent = value === 'synthetic-value' ? 'synthetic-success' : 'synthetic-failed';
      });
    </script>
  </body>
</html>`;

function boundedResponse(response, status, message) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end(message);
}

function hostHeaderCount(request) {
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === 'host') count += 1;
  }
  return count;
}

function rejectBodylessRequest(request, response) {
  if (Number(request.headers['content-length'] ?? 0) > 0 || request.headers['transfer-encoding']) {
    boundedResponse(response, 400, 'body-not-allowed');
    return true;
  }
  return false;
}

function readBoundedBody(request, response) {
  return new Promise((resolve) => {
    let bytes = 0;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > SERVER_LIMITS.body_bytes) {
        boundedResponse(response, 413, 'body-too-large');
        request.destroy();
        resolve(null);
        return;
      }
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', () => resolve(null));
  });
}

export function startBrowserLocalServer(options = {}) {
  const page = options.page ?? PAGE;
  const limits = { ...SERVER_LIMITS, ...(options.limits ?? {}) };
  let approvedHost = null;
  let requestCount = 0;
  let activeConnections = 0;
  const server = createServer({ maxHeaderSize: limits.header_bytes }, async (request, response) => {
    requestCount += 1;
    if (requestCount > limits.requests) {
      boundedResponse(response, 429, 'request-limit');
      return;
    }
    if (hostHeaderCount(request) !== 1 || request.headers.host !== approvedHost) {
      boundedResponse(response, 400, 'bad-host');
      return;
    }
    if (!['GET', 'POST'].includes(request.method ?? '')) {
      boundedResponse(response, 405, 'method-not-allowed');
      return;
    }
    if (!request.url || request.url.startsWith('http://') || request.url.startsWith('https://') || /[\u0000-\u001f\u007f\\]/.test(request.url) || /%2e/i.test(request.url)) {
      boundedResponse(response, 400, 'bad-route');
      return;
    }
    let url;
    try {
      url = new URL(request.url, `http://${approvedHost}`);
    } catch {
      boundedResponse(response, 400, 'bad-route');
      return;
    }
    if (url.origin !== `http://${approvedHost}` || url.search || url.hash || url.pathname.includes('..') || decodeURIComponent(url.pathname).includes('..')) {
      boundedResponse(response, 400, 'bad-route');
      return;
    }
    if (request.method === 'GET') {
      if (rejectBodylessRequest(request, response)) return;
      if (url.pathname === '/' || url.pathname === '/favicon.ico') {
        response.writeHead(url.pathname === '/' ? 200 : 204, {
          'content-type': url.pathname === '/' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(url.pathname === '/' ? page : '');
        return;
      }
      boundedResponse(response, 404, 'not-found');
      return;
    }
    if (url.pathname !== '/submit') {
      boundedResponse(response, 404, 'not-found');
      return;
    }
    if (request.headers['content-type'] !== 'application/x-www-form-urlencoded') {
      boundedResponse(response, 415, 'unsupported-content-type');
      return;
    }
    const body = await readBoundedBody(request, response);
    if (body === null || response.writableEnded) return;
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    });
    response.end('{"status":"ok"}');
  });
  server.headersTimeout = limits.headers_timeout_ms;
  server.keepAliveTimeout = limits.keep_alive_timeout_ms;
  server.maxHeadersCount = limits.headers_count;
  server.maxRequestsPerSocket = limits.requests;
  server.requestTimeout = limits.request_timeout_ms;
  server.on('connection', (socket) => {
    activeConnections += 1;
    if (activeConnections > limits.max_connections) socket.destroy();
    socket.on('close', () => { activeConnections -= 1; });
  });
  server.on('connect', (request, socket) => {
    requestCount += 1;
    socket.end('HTTP/1.1 405 Method Not Allowed\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: 18\r\nconnection: close\r\n\r\nmethod-not-allowed');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Local browser fixture did not bind a TCP port.'));
        return;
      }
      approvedHost = `127.0.0.1:${address.port}`;
      resolve({
        baseURL: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve, closeReject) => server.close((error) => (error ? closeReject(error) : closeResolve()))),
        requestCount: () => requestCount,
      });
    });
  });
}
