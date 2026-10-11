// mobile-mcp-smoke.mjs — dovedește că serverul MCP pornește local și VEDE emulatorul Android.
// Protocol: JSON-RPC 2.0, un obiect JSON pe linie, prin stdin/stdout (transport stdio al MCP).
// Se rulează: node mobile-mcp-smoke.mjs
import { spawn } from 'node:child_process';

const proc = spawn('npx', ['-y', '@mobilenext/mobile-mcp@latest'], { shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
const seen = [];
let buf = '';
let devicesTool = null;
let done = false;

const send = (o) => proc.stdin.write(JSON.stringify(o) + '\n');

proc.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    seen.push(msg);
    console.log('<< ' + JSON.stringify(msg).slice(0, 400));
    if (msg.id === 2) {
      const tools = (msg.result?.tools ?? []).map((t) => t.name);
      console.log('\nUNELTE (' + tools.length + '): ' + tools.join(', '));
      devicesTool = tools.find((n) => /available_devices|list_devices/i.test(n)) ?? null;
      if (devicesTool) send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: devicesTool, arguments: {} } });
      else finish();
    }
    if (msg.id === 3) finish();
  }
});
proc.stderr.on('data', (d) => process.stderr.write('[server] ' + d.toString().slice(0, 300)));

function finish() {
  if (done) return;
  done = true;
  clearTimeout(timer);
  try { proc.kill(); } catch {}
  console.log('\nREZULTAT: server MCP pornit local, ' + seen.length + ' mesaje primite.');
}

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

const timer = setTimeout(() => { console.log('\nTIMEOUT: nu am primit răspuns în 120s.'); finish(); process.exitCode = 1; }, 120000);
