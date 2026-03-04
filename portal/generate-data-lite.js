#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORTAL_REPO = '/Users/openclaw/workspace/cliffcircuit-ai';
const DATA_PATH = path.join(PORTAL_REPO, 'portal/data.json');
const QUEUE_FILE = '/Users/openclaw/.openclaw/workspace/samantha/content-queue.json';

try {
  console.log('Generating light portal data...');
  const queueRaw = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const queue = Array.isArray(queueRaw) ? queueRaw : queueRaw.queue;
  
  const cleanQueue = queue.map(({ htmlContent, ...rest }) => rest);

  const data = {
    generatedAt: new Date().toISOString(),
    auth: { passwordHash: '1b2a92a86286fbc041d175321caa4a11309d3daf6c7502209edbb60135287cb7' },
    queue: cleanQueue,
  };

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

  // Push with proper encoding
  try {
      execSync('git config user.email "cliff@cliffcircuit.ai"', { cwd: PORTAL_REPO, encoding: 'utf8' });
      execSync('git config user.name "Cliff"', { cwd: PORTAL_REPO, encoding: 'utf8' });
      execSync('git add portal/data.json', { cwd: PORTAL_REPO, encoding: 'utf8' });
      const status = execSync('git status --porcelain', { cwd: PORTAL_REPO, encoding: 'utf8' }).trim();
      if (status) {
        execSync('git commit -m "chore: light portal update"', { cwd: PORTAL_REPO, encoding: 'utf8' });
        execSync('git push origin main', { cwd: PORTAL_REPO, encoding: 'utf8' });
      }
  } catch(e) { console.error('Git push failed:', e.message); }

  console.log('Update complete.');
} catch(e) {
  console.error('Data generation failed:', e);
}
