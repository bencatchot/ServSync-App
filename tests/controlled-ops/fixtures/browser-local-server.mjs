import { createServer } from 'node:http';

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

export function startBrowserLocalServer() {
  const server = createServer((request, response) => {
    if (request.url === '/' || request.url === '/favicon.ico') {
      response.writeHead(request.url === '/' ? 200 : 204, {
        'content-type': request.url === '/' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(request.url === '/' ? PAGE : '');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not-found');
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
      resolve({
        baseURL: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve, closeReject) => server.close((error) => (error ? closeReject(error) : closeResolve()))),
      });
    });
  });
}
