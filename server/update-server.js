import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');
const PORT = 3100;

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

let updateInProgress = false;

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/system/info' && req.method === 'GET') {
    let hash = '?', date = '?', branch = '?', behindCount = 0;
    try {
      hash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
      date = execSync('git log -1 --format=%ci', { cwd: PROJECT_DIR }).toString().trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_DIR }).toString().trim();
      execSync('git fetch origin --quiet', { cwd: PROJECT_DIR, timeout: 15000 });
      const behind = execSync(`git rev-list HEAD..origin/${branch} --count`, { cwd: PROJECT_DIR }).toString().trim();
      behindCount = parseInt(behind) || 0;
    } catch {}
    json(res, {
      version: getVersion(),
      git: { hash, date, branch },
      updateAvailable: behindCount > 0,
      behindCount,
      nodeVersion: process.version,
    });
    return;
  }

  if (url.pathname === '/api/system/update' && req.method === 'POST') {
    if (updateInProgress) {
      json(res, { error: 'Обновление уже выполняется' }, 409);
      return;
    }

    updateInProgress = true;
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const steps = [
      { label: 'Сброс локальных изменений', cmd: 'git', args: ['reset', '--hard', 'HEAD'] },
      { label: 'Загрузка обновлений', cmd: 'git', args: ['pull', 'origin', 'main'] },
      { label: 'Установка зависимостей', cmd: 'npm', args: ['ci', '--include=dev', '--loglevel=error'] },
      { label: 'Сборка проекта', cmd: 'npm', args: ['run', 'build'] },
      { label: 'Сборка Wallet', cmd: 'npm', args: ['run', 'build:wallet'] },
    ];

    let stepIdx = 0;

    const runStep = () => {
      if (stepIdx >= steps.length) {
        try { execSync('chown -R www-data:www-data dist', { cwd: PROJECT_DIR }); } catch {}
        try { execSync('chown -R www-data:www-data dist-wallet', { cwd: PROJECT_DIR }); } catch {}
        try { execSync('systemctl restart tpos-wallet-bot', { timeout: 5000 }); } catch {}
        try { execSync('systemctl restart tpos-update', { timeout: 5000 }); } catch {}
        send({ type: 'complete', message: 'Обновление завершено. Если добавлены новые таблицы — выполните SQL из supabase/migration.sql в Supabase Dashboard.' });
        res.end();
        updateInProgress = false;
        return;
      }

      const step = steps[stepIdx];
      send({ type: 'step', step: stepIdx + 1, total: steps.length, label: step.label });

      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_ENV;
      const proc = spawn(step.cmd, step.args, {
        cwd: PROJECT_DIR,
        env: cleanEnv,
        shell: true,
      });

      proc.stdout.on('data', (chunk) => {
        send({ type: 'log', text: chunk.toString().trim() });
      });
      proc.stderr.on('data', (chunk) => {
        send({ type: 'log', text: chunk.toString().trim() });
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          send({ type: 'error', message: `Ошибка: "${step.label}" (код ${code})` });
          res.end();
          updateInProgress = false;
          return;
        }
        send({ type: 'step_done', step: stepIdx + 1, label: step.label });
        stepIdx++;
        runStep();
      });
    };

    runStep();
    return;
  }

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`T-POS Update Server on port ${PORT}`);
});
