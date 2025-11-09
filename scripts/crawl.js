const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

/* -------------- 基础目录 -------------- */
const historyDir = path.join(__dirname, '../data/history');
const publicDir  = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
if (!fs.existsSync(publicDir))  fs.mkdirSync(publicDir, { recursive: true });

/* -------------- 国服抓取 -------------- */
async function crawlCN() {
  try {
    const res = await axios.get('https://ff14act.web.sdo.com/api/cosmicData/getCosmicData', {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      params: { t: Date.now() },
      timeout: 15000
    });
    if (res.data?.code !== 10000 || !Array.isArray(res.data.data) || res.data.data.length === 0) return [];
    return res.data.data.map(item => ({
      region: item.area_name || '国服',
      server: item.group_name || '未知服务器',
      progress: Math.min(Math.max(parseInt(item.ProgressRate || 0) / 10, 0), 100),
      level: parseInt(item.DevelopmentGrade || 0),
      lastUpdate: item.data_time || moment().utcOffset(+8).format('YYYY-MM-DD HH:mm:ss'),
      source: 'cn',
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.error('国服爬取失败:', e.message);
    return [];
  }
}

/* -------------- 国际服抓取 -------------- */
async function crawlNA() {
  try {
    const res = await axios.get('https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 20000
    });
    const $ = cheerio.load(res.data);
    const servers = [];
    $('.cosmic__report__card').each((i, el) => {
      const serverName = $(el).find('.cosmic__report__card__name p').text().trim();
      if (!serverName) return;
      let progress = 0;
      if ($(el).hasClass('completed')) progress = 100;
      else {
        const m = ($(el).find('.cosmic__report__status__progress__bar').attr('class') || '').match(/gauge-(\d+)/);
        if (m) progress = Math.round((parseInt(m[1], 10) / 8) * 100 * 10) / 10;
      }
      const level = parseInt($(el).find('.cosmic__report__grade__level p').text().trim() || 0);
      const dcTitle = $(el).closest('.cosmic__report__dc').find('.cosmic__report__dc__title').text().trim();
      const naDCs = ['Aether', 'Crystal', 'Dynamis', 'Primal'];
      const euDCs = ['Chaos', 'Light'];
      const ocDCs = ['Materia'];
      const jpDCs = ['Elemental', 'Gaia', 'Mana', 'Meteor'];
      let region = '国际服-未知区域';
      if (naDCs.includes(dcTitle)) region = '国际服-北美';
      else if (euDCs.includes(dcTitle)) region = '国际服-欧洲';
      else if (ocDCs.includes(dcTitle)) region = '国际服-大洋洲';
      else if (jpDCs.includes(dcTitle)) region = '国际服-日本';
      servers.push({ region, server: serverName, dc: dcTitle, progress, level, lastUpdate: moment().utcOffset(+8).format('YYYY-MM-DD HH:mm:ss'), source: 'na', timestamp: new Date().toISOString() });
    });
    return servers;
  } catch (e) {
    console.error('国际服爬取失败:', e.message);
    return [];
  }
}

/* -------------- 读取“干净”快照 -------------- */
function getLastHistoryData() {
  try {
    const files = fs.readdirSync(historyDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.changes.json'))
      .map(f => ({ name: f, time: new Date(f.replace('.json', '').replace(/-/g, ' ')) }))
      .sort((a, b) => b.time - a.time);
    if (files.length) {
      const arr = JSON.parse(fs.readFileSync(path.join(historyDir, files[0].name), 'utf8'));
      // 只保留「服务器数据」：必须有 source 字段
      return Array.isArray(arr) ? arr.filter(item => item.source) : [];
    }
  } catch (e) { console.error('读取历史失败:', e.message); }
  return [];
}

/* -------------- 主函数 -------------- */
async function main() {
  const [cn, na] = await Promise.all([crawlCN(), crawlNA()]);
  const current = [...cn, ...na];
  if (!current.length) { console.log('未获取到任何有效数据'); return; }

  /* 1. 上一周期快照 → Map */
  const lastMap = new Map(getLastHistoryData().map(s => [`${s.region}-${s.server}`, s.progress]));

  /* 2. 本次变化（仅当前周期）*/
  const changes = [];
  current.forEach(c => {
    const k = `${c.region}-${c.server}`;
    const old = lastMap.get(k);
    if (old !== undefined && old !== c.progress) changes.push({
      serverId: k, oldProgress: old, newProgress: c.progress,
      changeTime: moment().utcOffset(+8).format('YYYY-MM-DD HH:mm:ss')
    });
  });

  /* 3. 写文件 */
  const ts = moment().utcOffset(+8).format('YYYY-MM-DD-HH-mm');
  fs.writeFileSync(path.join(historyDir, `${ts}.json`), JSON.stringify(current, null, 2));
  const publicFile = path.join(publicDir, 'data.json');
  fs.writeFileSync(publicFile, JSON.stringify(current, null, 2));
  if (changes.length) fs.writeFileSync(
    path.join(historyDir, `${ts}.changes.json`),
    JSON.stringify({ type: 'progress_changes', count: changes.length, changes }, null, 2)
  );

  /* 4. 日志 */
  console.log(`保存 ${current.length} 条数据 → ${ts}.json & public/data.json`);
  if (changes.length) console.log(`本次变化: ${changes.map(c => c.serverId).join(', ')}`);
  else console.log('本次无变化');
}

main();
