const fs = require('fs');
const http = require('http');
const https = require('https');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

// ====== НАСТРОЙКИ =====
const MAX_CONFIGS = 1000;
const SOURCE_TIMEOUT = 10000;
const SOURCE_PARALLEL_LIMIT = 5;

// Telegram API settings (из Secrets)
const apiId = parseInt(process.env.TG_API_ID || "0", 10);
const apiHash = process.env.TG_API_HASH || "";
const stringSession = new StringSession(process.env.TG_SESSION || "");

// Закрытые каналы Telegram
const TG_CHANNELS = [
  'VlessTrogan',
  'hiddifycode',
  'TunPass',
  'ClosingVPN',
  'LowiKForum',
  'Ask_a_CM',
  'urlsources',
  'glforum'
];

const WHITELIST_DOMAINS = new Set(['cloudflare.com', 'google.com']);
const PARSED_CIDRS = [];

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function normalizeToRawUrl(url) {
  try {
    if (url.includes('github.com') && url.includes('/blob/')) {
      return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }
    if (url.includes('gitverse.ru') && url.includes('/blob/')) {
      return url.replace('/blob/', '/raw/');
    }
    const u = new URL(url);
    return u.toString();
  } catch (e) {}
  return url;
}

// ====== ПОЛУЧЕНИЕ ДАННЫХ ИЗ ЗАКРЫТЫХ TG КАНАЛОВ ======
async function fetchTelegramPosts() {
  if (!apiId || !apiHash || !process.env.TG_SESSION) {
    console.log("⚠️ Переменные Telegram не найдены. Пропускаем Telegram...");
    return [];
  }

  console.log("📱 Подключение к Telegram ( GramJS )...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 3,
  });

  const texts = [];
  try {
    await client.connect();
    for (const channel of TG_CHANNELS) {
      try {
        const messages = await client.getMessages(channel, { limit: 15 });
        for (const msg of messages) {
          if (msg.message) texts.push(msg.message);
        }
      } catch (err) {
        console.log(`⚠️ Ошибка чтения канала ${channel}:`, err.message);
      }
    }
    await client.disconnect();
  } catch (e) {
    console.log("⚠️ Ошибка подключения к Telegram:", e.message);
  }

  return texts;
}

// ====== ВЕБ ИСТОЧНИКИ (GitHub / GitVerse) ======
function discoverWebSources() {
  const sources = [
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/vless',
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/trojan',
    'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/All_Configs_Sub.txt',
    'https://raw.githubusercontent.com/SubscribesCollection/V2ray-Configs/main/All_Configs_Sub.txt'
  ];

  return Array.from(new Set(sources)).map(normalizeToRawUrl);
}

// ====== ПРОВЕРКИ БЕЛЫХ СПИСКОВ ======
function isIpInCidr(ip) {
  if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) return false;
  const ipLong = ipToLong(ip);
  for (const cidr of PARSED_CIDRS) {
    if ((ipLong & cidr.mask) === (cidr.ip & cidr.mask)) return true;
  }
  return false;
}

function isSniAllowed(sni) {
  if (!sni) return false;
  const lowerSni = sni.toLowerCase().trim();
  if (WHITELIST_DOMAINS.has(lowerSni)) return true;
  for (const domain of WHITELIST_DOMAINS) {
    if (lowerSni.endsWith('.' + domain) || domain.endsWith('.' + lowerSni)) return true;
  }
  return false;
}

// ====== ПАРСИНГ ======
function extractConfigsFromText(text) {
  const list = [];
  if (!text) return list;

  text = text.replace(/&amp;/g, '&');

  if (!text.includes('vless://') && !text.includes('trojan://')) {
    try {
      const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
      if (decoded.includes('vless://') || decoded.includes('trojan://')) {
        text = decoded;
      }
    } catch (e) {}
  }

  const linkRegex = /(vless|trojan|vmess|ss):\/\/[^\s"'<>`\\)]+/g;
  const linkMatches = text.match(linkRegex) || [];
  linkMatches.forEach(link => list.push(link.trim()));
  return list;
}

function fetchTextWithHeaders(url) {
  return new Promise((resolve) => {
    let parsedUrl;
    try { parsedUrl = new URL(url); } catch (e) { return resolve(''); }
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    let req = lib.get(url, { headers, timeout: SOURCE_TIMEOUT }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, url).toString();
        }
        return resolve(fetchTextWithHeaders(redirectUrl));
      }
      if (res.statusCode !== 200) return resolve('');

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

async function fetchAllSourcesParallel(sources) {
  console.log(`📥 [onyxVPN] Скачивание ${sources.length} веб-источников...`);
  const results = [];
  let index = 0;

  async function sourceWorker() {
    while (index < sources.length) {
      const currentUrl = sources[index++];
      const text = await fetchTextWithHeaders(currentUrl);
      if (text) results.push(text);
    }
  }

  const workers = Array.from({ length: Math.min(SOURCE_PARALLEL_LIMIT, sources.length) }, sourceWorker);
  await Promise.all(workers);
  return results;
}

// ====== ГЛАВНЫЙ ПРОЦЕСС ======
async function main() {
  console.time("⏱️ Общее время выполнения");
  console.log("🚀 Запуск парсера onyxVPN...");
  
  // 1. Собираем тексты из Telegram и Веба
  const tgTexts = await fetchTelegramPosts();
  const webSources = discoverWebSources();
  const webTexts = await fetchAllSourcesParallel(webSources);
  
  const rawTexts = [...tgTexts, ...webTexts];

  const finalConfigs = [];
  const seenUrls = new Set();
  const seenServers = new Set(); 
  let totalExtracted = 0;
  let rejectedByFilters = 0;

  console.log("⚙️ Фильтрация, дедупликация и сборка...");

  for (const text of rawTexts) {
    if (finalConfigs.length >= MAX_CONFIGS) break;
    const matches = extractConfigsFromText(text);

    for (let line of matches) {
      if (finalConfigs.length >= MAX_CONFIGS) break;
      if (!line || seenUrls.has(line)) continue;
      
      totalExtracted++;

      let urlPart = line;
      const hIdx = line.indexOf('#');
      if (hIdx !== -1) {
        urlPart = line.substring(0, hIdx).trim();
      }

      let hostMatch = urlPart.match(/@([^:]+):([0-9]+)/) || urlPart.match(/:\/\/([^:]+):([0-9]+)/);
      if (!hostMatch) continue;
      const hostOrIp = hostMatch[1];
      const port = hostMatch[2];

      let sni = '';
      const sniMatch = line.match(/[?&]sni=([^&#\s]+)/);
      if (sniMatch) {
        try { sni = decodeURIComponent(sniMatch[1]); } catch (e) { sni = sniMatch[1]; }
      }

      const sniValid = isSniAllowed(sni);
      const cidrValid = isIpInCidr(hostOrIp);

      if (!sniValid && !cidrValid) {
        rejectedByFilters++;
        continue; 
      }

      const serverKey = `${hostOrIp}:${port}:${sni || 'nosni'}`;
      if (seenServers.has(serverKey)) continue;

      seenUrls.add(line);
      seenServers.add(serverKey);

      const currentSni = sni ? sni : hostOrIp;
      const label = `onyxVPN | ${currentSni}`;
      
      finalConfigs.push(`${urlPart}#${label}`);
    }
  }

  console.log(`\n📊 Найдено сырых конфигураций: ${totalExtracted}`);
  console.log(`✂️ Отсеяно фильтрами: ${rejectedByFilters}`);
  console.log(`✅ Итого добавлено: ${finalConfigs.length}`);

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const header = `#profile-title: onyxVPN Filtered\n#profile-update-interval: 1\n#announce: 👑 База прокси onyxVPN | Всего: ${finalConfigs.length} | ${timestamp} UTC\n\n`;

  fs.writeFileSync('configs.txt', header + finalConfigs.join('\n'));
  console.log('💾 Результат сохранен в configs.txt!');
  console.timeEnd("⏱️ Общее время выполнения");
}

main();
