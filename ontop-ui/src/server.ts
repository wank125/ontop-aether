import { createServer, IncomingMessage, ServerResponse } from 'http';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse } from 'url';
import next from 'next';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:8081';
const LOG_DIR = join(process.cwd(), '..', 'logs');
const FRONTEND_LOG_FILE = join(LOG_DIR, 'frontend.log');

mkdirSync(LOG_DIR, { recursive: true });

// Paths migrated to ontop-engine (Java)
const ENGINE_PREFIXES = [
  '/api/v1/datasources/',
  '/api/v1/endpoint-registry',
  '/api/v1/mappings',
  '/api/v1/ontology',
  '/api/v1/sparql/',
];

// Bootstrap paths stay on Python backend (need LLM)
const BACKEND_OVERRIDES = [
  '/api/v1/datasources/',
];

function isBootstrapPath(pathname: string): boolean {
  return BACKEND_OVERRIDES.some(prefix => {
    if (!pathname.startsWith(prefix)) return false;
    const rest = pathname.slice(prefix.length);
    return rest.includes('/bootstrap');
  });
}

function shouldRouteToEngine(pathname: string): boolean {
  if (isBootstrapPath(pathname)) return false;
  if (pathname === '/api/v1/datasources') return true;
  return ENGINE_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function writeLog(level: 'INFO' | 'ERROR', message: string) {
  const line = `${new Date().toISOString()} |${level.padEnd(6)}| frontend - ${message}`;
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
  appendFileSync(FRONTEND_LOG_FILE, `${line}\n`, 'utf8');
}

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

app.prepare().then(() => {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const method = req.method || 'GET';
    const path = req.url || '/';
    try {
      const parsedUrl = parse(req.url!, true);
      const clientIp = req.socket.remoteAddress || '-';

      writeLog('INFO', `REQ  ${method} ${parsedUrl.pathname || path} from=${clientIp}`);

      // Runtime API proxy — routes /api/* to engine or backend
      if (parsedUrl.pathname?.startsWith('/api/')) {
        const useEngine = shouldRouteToEngine(parsedUrl.pathname);
        const targetUrl = useEngine ? ENGINE_URL : BACKEND_URL;
        const backendUrl = `${targetUrl}${parsedUrl.pathname}${parsedUrl.search || ''}`;

        // Build headers (drop hop-by-hop)
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (k === 'host' || k === 'connection' || k === 'transfer-encoding') continue;
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }

        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const body = hasBody ? await readBody(req) : undefined;

        const backendRes = await fetch(backendUrl, {
          method: req.method,
          headers,
          body: body ? new Uint8Array(body) : undefined,
        });

        res.statusCode = backendRes.status;
        backendRes.headers.forEach((v, k) => {
          if (k !== 'transfer-encoding' && k !== 'content-encoding') res.setHeader(k, v);
        });
        const buf = Buffer.from(await backendRes.arrayBuffer());
        res.end(buf);
        writeLog(
          'INFO',
          `RESP ${method} ${parsedUrl.pathname} status=${backendRes.status} duration=${Date.now() - started}ms proxy=${backendUrl}`,
        );
        return;
      }

      await handle(req, res, parsedUrl);
      writeLog(
        'INFO',
        `RESP ${method} ${parsedUrl.pathname || path} status=${res.statusCode} duration=${Date.now() - started}ms`,
      );
    } catch (err) {
      writeLog(
        'ERROR',
        `ERR  ${method} ${path} duration=${Date.now() - started}ms message=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.once('error', err => {
    writeLog('ERROR', `Server startup failure: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
  });
  server.listen(port, () => {
    writeLog(
      'INFO',
      `Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      } (backend -> ${BACKEND_URL}, engine -> ${ENGINE_URL})`,
    );
  });
});
