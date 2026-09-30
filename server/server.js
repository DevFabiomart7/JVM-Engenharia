import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
const maxBodyBytes = 12 * 1024;
const rateLimitWindowMs = 10 * 60 * 1000;
const rateLimitMax = 5;
const rateLimitBuckets = new Map();

loadLocalEnv();

const port = Number.parseInt(process.env.PORT || '3000', 10);
const mailTo = process.env.MAIL_TO || 'joao.nunes@jvmengenharia.com.br';
const mailFrom = process.env.MAIL_FROM || '';
const resendApiKey = process.env.RESEND_API_KEY || '';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const trustProxy = process.env.TRUST_PROXY === 'true';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);

  let requestUrl;
  try {
    requestUrl = new URL(request.url || '/', 'http://localhost');
  } catch {
    return sendJson(response, 400, { message: 'Requisição inválida.' });
  }

  if (requestUrl.pathname === '/api/health') {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return sendJson(response, 405, { message: 'Método não permitido.' });
    }
    return sendJson(response, 200, { status: 'ok', emailConfigured: Boolean(resendApiKey && mailFrom) });
  }

  if (requestUrl.pathname === '/api/contact') {
    return handleContact(request, response);
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    return sendJson(response, 404, { message: 'Rota não encontrada.' });
  }

  return serveStatic(request, response, requestUrl.pathname);
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.listen(port, '0.0.0.0', () => {
  console.log(`JVM site e API disponíveis na porta ${port}.`);
});

async function handleContact(request, response) {
  applyCors(request, response);

  if (!isAllowedOrigin(request)) {
    return sendJson(response, 403, { message: 'Origem da solicitação não autorizada.' });
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Max-Age': '600' });
    return response.end();
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(response, 405, { message: 'Método não permitido.' });
  }

  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    return sendJson(response, 415, { message: 'Formato de envio não suportado.' });
  }

  const clientKey = getClientKey(request);
  if (!consumeRateLimit(clientKey)) {
    return sendJson(response, 429, { message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    const status = error.statusCode || 400;
    return sendJson(response, status, { message: status === 413 ? 'A mensagem excede o tamanho permitido.' : 'Não foi possível ler os dados enviados.' });
  }

  if (typeof payload.website === 'string' && payload.website.trim()) {
    return sendJson(response, 202, { message: 'Mensagem recebida. A equipe da JVM entrará em contato.' });
  }

  const result = validateContact(payload);
  if (!result.ok) {
    return sendJson(response, 400, { message: result.message });
  }

  if (!resendApiKey || !mailFrom) {
    return sendJson(response, 503, { message: 'O envio de mensagens ainda não está configurado. Tente novamente mais tarde ou fale conosco pelo WhatsApp.' });
  }

  try {
    const providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [mailTo],
        reply_to: result.contact.email,
        subject: `Contato pelo site JVM: ${result.contact.subject}`,
        text: [
          'Nova mensagem recebida pelo formulário do site JVM.',
          '',
          `Nome: ${result.contact.name}`,
          `E-mail: ${result.contact.email}`,
          `Telefone: ${result.contact.phone || 'Não informado'}`,
          `Assunto: ${result.contact.subject}`,
          '',
          'Mensagem:',
          result.contact.message,
        ].join('\n'),
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!providerResponse.ok) {
      console.error(`Falha do provedor de e-mail (HTTP ${providerResponse.status}).`);
      return sendJson(response, 502, { message: 'Não foi possível enviar sua mensagem agora. Tente novamente mais tarde.' });
    }

    return sendJson(response, 200, { message: 'Mensagem enviada. A equipe da JVM entrará em contato.' });
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    console.error(timedOut ? 'Tempo esgotado ao enviar pelo provedor de e-mail.' : 'Falha de conexão com o provedor de e-mail.');
    return sendJson(response, 502, { message: 'Não foi possível enviar sua mensagem agora. Tente novamente mais tarde.' });
  }
}

function validateContact(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Confira os dados e tente novamente.' };
  }

  const name = cleanText(payload.nome, 100);
  const email = cleanText(payload.email, 254).toLowerCase();
  const phone = cleanText(payload.telefone, 30);
  const subject = cleanText(payload.assunto, 60);
  const message = cleanText(payload.mensagem, 4_000);
  const subjects = new Set([
    'Serviços de engenharia',
    'Inspeções e laudos',
    'Cursos e treinamentos',
    'Outro assunto',
  ]);

  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: 'Informe um nome e um e-mail válidos.' };
  }
  if (phone && !/^[0-9+() .-]{8,30}$/.test(phone)) {
    return { ok: false, message: 'Confira o telefone informado.' };
  }
  if (!subjects.has(subject)) {
    return { ok: false, message: 'Selecione um assunto válido.' };
  }
  if (message.length < 10) {
    return { ok: false, message: 'A mensagem precisa ter pelo menos 10 caracteres.' };
  }

  return { ok: true, contact: { name, email, phone, subject, message } };
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    let bytes = 0;
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBodyBytes) {
        const error = new Error('Request body too large');
        error.statusCode = 413;
        tooLarge = true;
        reject(error);
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (tooLarge) return;
      try {
        resolveBody(JSON.parse(body));
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;

  const forwardedProtocol = trustProxy ? request.headers['x-forwarded-proto']?.split(',')[0].trim() : '';
  const protocol = forwardedProtocol || (request.socket.encrypted ? 'https' : 'http');
  return origin === `${protocol}://${request.headers.host}`;
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(request)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function getClientKey(request) {
  if (trustProxy) {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim().slice(0, 64);
    }
  }
  return request.socket.remoteAddress || 'unknown';
}

function consumeRateLimit(key) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= rateLimitWindowMs) {
    rateLimitBuckets.set(key, { count: 1, startedAt: now });
    pruneRateLimits(now);
    return true;
  }
  if (bucket.count >= rateLimitMax) return false;
  bucket.count += 1;
  return true;
}

function pruneRateLimits(now) {
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.startedAt >= rateLimitWindowMs) rateLimitBuckets.delete(key);
  }
  if (rateLimitBuckets.size > 10_000) {
    const oldestKey = rateLimitBuckets.keys().next().value;
    rateLimitBuckets.delete(oldestKey);
  }
}

function serveStatic(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return sendJson(response, 405, { message: 'Método não permitido.' });
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return sendJson(response, 400, { message: 'Caminho inválido.' });
  }

  const allowedPages = new Set(['/index.html', '/sobre.html', '/servicos.html', '/cursos.html', '/contato.html']);
  const allowedPath = decodedPath === '/' || allowedPages.has(decodedPath) || /^\/(css|js|assets)\/[a-zA-Z0-9._/-]+$/.test(decodedPath);
  if (!allowedPath || decodedPath.split('/').includes('..')) {
    return sendJson(response, 404, { message: 'Página não encontrada.' });
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const filePath = resolve(projectRoot, relativePath);
  const relativeCheck = filePath.slice(projectRoot.length);
  if (relativeCheck && !relativeCheck.startsWith(sep)) {
    return sendJson(response, 404, { message: 'Página não encontrada.' });
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return sendJson(response, 404, { message: 'Página não encontrada.' });
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Cache-Control', allowedPages.has(`/${relativePath}`) ? 'no-cache' : 'public, max-age=3600');
  if (request.method === 'HEAD') return response.end();
  return createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  return response.end(JSON.stringify(data));
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function loadLocalEnv() {
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
