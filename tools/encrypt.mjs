import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const source = process.argv[2] || 'content.json';
const target = process.argv[3] || 'vault.js';
const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question('设置访问密码（输入时会显示，请注意周围环境）: ');
rl.close();
if (password.length < 10) throw new Error('密码至少需要 10 个字符。');

const journal = JSON.parse(await readFile(source, 'utf8'));
const imageMime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
for (const moment of journal.moments || []) {
  for (const photo of moment.photos || []) {
    if (/^(https?:|data:)/i.test(photo.src)) continue;
    const file = resolve(dirname(source), photo.src);
    const mime = imageMime[extname(file).toLowerCase()];
    if (!mime) throw new Error(`不支持的图片格式: ${photo.src}`);
    photo.src = `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
  }
}
const plaintext = Buffer.from(JSON.stringify(journal), 'utf8');
const salt = randomBytes(16);
const iv = randomBytes(12);
const iterations = 310000;
const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
const vault = { version: 1, iterations, salt: salt.toString('base64'), iv: iv.toString('base64'), data: encrypted.toString('base64') };
await writeFile(target, `const VAULT = ${JSON.stringify(vault)};\n`);
console.log(`已生成 ${target}。确认解锁正常后，不要提交 ${source}。`);
