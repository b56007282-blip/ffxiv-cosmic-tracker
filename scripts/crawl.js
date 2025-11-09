#!/usr/bin/env node
/**
 * FFXIV 宇宙探索进度爬虫
 * 先删除旧 changes.json，再写本次新的
 */
const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');
const moment  = require('moment');

/* 1. 目录初始化 */
const repoRoot   = path.resolve(__dirname, '..');
const historyDir = path.join(repoRoot, 'data', 'history');
const publicDir  = path.join(repoRoot, 'public');
const publicFile = path.join(publicDir, 'data.json');
fs.mkdirSync(historyDir, { recursive: true });
fs.mkdirSync(publicDir,  { recursive: true });

/* 2. GMT+8 时间 */
const now8 = () => moment().utcOffset(+8);

/* 3. 国服抓取 */
async function fetchCN() {
  try {
    const { data } = await axios.get('https://ff14act.web.sdo.com/api/cosmicData/getCosmicData', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      params: { t: Date.now() },
      timeout: 15000
    });
    if (data?.code !== 10000 || !Array.isArray(data.data) || data.data.length === 0) return [];
    return data.data.map(it => ({
      region: it.area_name || '国服',
      server: it.group_name || '未知服务器',
      progress: Math.min(Math.max(parseInt(it.ProgressRate || 0) / 10, 0), 100),
      level: parseInt(it.DevelopmentGrade || 0),
      lastUpdate: it.data_time || now8().format('YYYY-MM-DD HH:mm:ss'),
      source: 'cn'
    }));
  } catch (e) {
    console.error('[CN] 抓取失败:', e.message);
    return [];
  }
}

/* 4. 国际服抓取 */
async function fetchNA() {
  try {
    const { data: html } = await axios.get('https://na.finalfantasyxiv.com/lodestone/cosmic_exploration/report/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 20000
    });
    const $ = cheerio.load(html);
    const servers = [];
    $('.cosmic__report__card').each((_, el) => {
      const name = $(el).find('.cosmic__report__card__name p').text().trim();
      if (!name) return;
      let progress = 0;
      if ($(el).hasClass('completed')) progress = 100;
      else {
        const m = ($(el).find('.cosmic__report__status__progress__bar').attr('class') || '').match(/gauge-(\d+)/);
        if (m) progress = Math.round((parseInt(m[1], 10) / 8) * 100 * 10) / 10;
      }
      const level = parseInt($(el).find('.cosmic__report__grade__level p').text().trim() || 0);
      const dc = $(el).closest('.cosmic__report__dc').find('.cosmic__report__dc__title').text().trim();
      const regionMap = { Aether: '国际服-北美', Crystal: '国际服-北美', Dynamis: '国际服-北美', Primal: '国际服-北美',
                          Chaos: '国际服-欧洲', Light: '国际服-欧洲', Materia: '国际服-大洋洲',
                          Elemental: '国际服-日本', Gaia: '国际服-日本', Mana: '国际服-日本', Meteor: '国际服-日本' };
      servers.push({ region: regionMap[dc] || '国际服-未知区域', server: name, dc, progress, level, lastUpdate: now8().format('YYYY-MM-DD HH:mm:ss'), source: 'na' });
    });
    return servers;
  } catch (e) {
    console.error('[NA] 抓取失败:', e.message);
    return [];
  }
}

/* 5. 读取上一周期干净快照 */
function loadLastSnap() {
  try {
    const files = fs.readdirSync(historyDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.changes.json'))
      .map(f => ({ name: f, time: new Date(f.slice(0, -5).replace(/-/g, ' ')) }))
      .sort((a, b) => b.time - a.time);
    if (!files.length) return new Map();
    const arr = JSON.parse(fs.readFileSync(path.join(historyDir, files[0].name), 'utf8'));
    return new Map(arr.filter(it => it.source).map(it => [`${it.region}-${it.server}`, it.progress]));
  } catch (e) {
    console.warn('读取历史快照失败:', e.message);
    return new Map();
  }
}

/* 6. 主流程 */
(async () => {
  /* 6.1 先清旧 changes.json */
  fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.changes.json'))
    .forEach(f => fs.unlinkSync(path.join(historyDir, f)));

  const [cn, na] = await Promise.all([fetchCN(), fetchNA()]);
  const current = [...cn, ...na];
  if (!current.length) { console.log('未获取到任何数据'); return; }

  /* 6.2 计算本次变化 */
  const lastMap = loadLastSnap();
  const changes = [];
  current.forEach(it => {
    const key = `${it.region}-${it.server}`;
    const old = lastMap.get(key);
    if (old !== undefined && old !== it.progress) changes.push({
      serverId: key, oldProgress: old, newProgress: it.progress,
      changeTime: now8().format('YYYY-MM-DD HH:mm:ss')
    });
  });

  /* 6.3 写文件 */
  const ts = now8().format('YYYY-MM-DD-HH-mm');
  fs.writeFileSync(path.join(historyDir, `${ts}.json`), JSON.stringify(current, null, 2));
  fs.writeFileSync(path.join(publicDir, 'data.json'), JSON.stringify(current, null, 2));
  if (changes.length) fs.writeFileSync(
    path.join(historyDir, `${ts}.changes.json`),
    JSON.stringify({ type: 'progress_changes', count: changes.length, changes }, null, 2)
  );

  /* 6.4 日志 */
  console.log(`保存 ${current.length} 条数据 → ${ts}.json & public/data.json`);
  if (changes.length) console.log(`本次变化: ${changes.map(c => c.serverId).join(', ')}`);
  else console.log('本次无变化');
})();
